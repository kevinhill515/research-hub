"""
factset_pull.py — Daily FactSet + Rep-Holdings pull for Research Hub.

What it does
------------
1. Opens Excel in MANUAL CALCULATION MODE so the workbook open is fast
   (doesn't auto-fire _xll.FDSLIVE real-time cells).
2. Opens Master List.xlsm so LoadPositions macro is available.
3. Opens Research Hub Upload.xlsx.
4. Runs `'Master List.xlsm'!LoadPositions` (same as clicking the Refresh
   Positions button) and waits for the rep holdings to populate cols A-I.
5. Recalculates cols K-N on the Rep Holdings sheet (user's parsing formulas).
6. Triggers a FactSet refresh on the main workbook.
7. Reads every relevant sheet + pushes to Supabase.
8. Closes Excel cleanly.

Environment
-----------
* Windows with Excel installed, FactSet add-in installed and signed in.
* Python 3.10+ with pywin32.
* The two workbook paths below must exist.

Designed for Windows Task Scheduler at 07:30 PT, weekdays.
"""

from __future__ import annotations

import sys
import time
import json
import re
import traceback
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ----------------------------------------------------------------------
# Configuration — edit these four paths for your setup.
# ----------------------------------------------------------------------
# UNC paths are used deliberately. Task Scheduler with LogonType=Password
# runs in a non-interactive session that does NOT inherit the user's
# mapped drives (H:, Y:, G:), so drive-letter paths fail silently with
# exit code 2 (file not found) and nothing even reaches the log.
# UNC paths work in both interactive and scheduled-task contexts.
WORKBOOK_PATH    = Path(r"\\FS01\USERS\khill\Research Hub\Research Hub Upload.xlsx")
MASTER_LIST_PATH = Path(r"\\FS01\USERS\khill\Research Hub\Master List COPY.xlsm")
LOG_PATH         = Path(r"\\FS01\USERS\khill\Research Hub\factset_pull.log")

SUPA_URL = "https://vesnqbxswmggdfevqokt.supabase.co"
SUPA_KEY = "sb_publishable_7kqbGZlL_im9kIpgFXLA-A_9CdqsyiT"

# How long to wait after each refresh trigger.
REP_WAIT_SECONDS      = 25   # Refresh Positions — user said ~15s, give buffer
FACTSET_WAIT_SECONDS  = 120  # FactSet full workbook refresh

# Last row of data per sheet — generous ceilings; script skips blanks.
MAX_COMPANY_ROW      = 400
MAX_REP_HOLDINGS_ROW = 5000

# ----------------------------------------------------------------------
# Logging
# ----------------------------------------------------------------------
def log(msg: str) -> None:
    line = f"[{datetime.now().isoformat(timespec='seconds')}] {msg}"
    print(line, flush=True)
    try:
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with LOG_PATH.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


# ----------------------------------------------------------------------
# Supabase helpers (stdlib only)
# ----------------------------------------------------------------------
def _supa_req(method: str, path: str, body: bytes | None = None,
              accept_object: bool = False) -> bytes:
    url = f"{SUPA_URL}/rest/v1/{path}"
    headers = {
        "apikey": SUPA_KEY,
        "Authorization": f"Bearer {SUPA_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    if accept_object:
        headers["Accept"] = "application/vnd.pgrst.object+json"
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        # Surface PostgREST's error body so 4xx/5xx are diagnosable. Without
        # this, all the script logs is "HTTP Error 500: Internal Server Error"
        # with no hint what the DB actually objected to.
        try:
            err_body = e.read().decode("utf-8", errors="replace")[:1000]
        except Exception:
            err_body = "(could not read error body)"
        body_preview = ""
        if body:
            try:
                body_preview = f" body_bytes={len(body)}"
            except Exception:
                pass
        log(f"  Supabase {method} {path} -> {e.code}{body_preview}: {err_body}")
        raise


def supa_get_companies() -> list[dict]:
    raw = _supa_req("GET", "companies?id=eq.shared&select=data", accept_object=True)
    return json.loads(json.loads(raw)["data"])


def supa_put_companies(companies: list[dict]) -> None:
    body = json.dumps({"id": "shared", "data": json.dumps(companies)}).encode()
    _supa_req("POST", "companies", body=body)


def supa_get_meta(key: str) -> Any:
    try:
        raw = _supa_req("GET", f"meta?key=eq.{key}&select=value", accept_object=True)
        return json.loads(json.loads(raw)["value"])
    except (urllib.error.HTTPError, KeyError, json.JSONDecodeError):
        return None


def supa_put_meta(key: str, value: Any) -> None:
    body = json.dumps({"key": key, "value": json.dumps(value)}).encode()
    _supa_req("POST", "meta", body=body)


# ----------------------------------------------------------------------
# Excel COM
# ----------------------------------------------------------------------
# xlCalculationManual = -4135; xlCalculationAutomatic = -4105
CALC_MANUAL    = -4135
CALC_AUTOMATIC = -4105

# Excel cell-error COM values returned by .Value when a cell has an error.
# These are integers around -2.1 billion — never legitimate finance data.
EXCEL_ERROR_MIN = -2146826300
EXCEL_ERROR_MAX = -2146826200


def _is_excel_error(v) -> bool:
    """True if an Excel cell's value is a COM error (like #NAME?, #N/A).
    These come back as negative integers near -2.15e9."""
    return isinstance(v, int) and EXCEL_ERROR_MIN <= v <= EXCEL_ERROR_MAX


def _enable_factset_addins(xl) -> None:
    """Force-load any FactSet-related add-in into the current Excel instance.
    DispatchEx starts fresh with no add-ins; without this, _xll.FDS returns
    #NAME? for every cell.

    For .XLL add-ins we use Application.RegisterXLL(path) which is the
    correct loader; just setting `Installed = True` doesn't work for
    compiled XLLs. We also try the standard .Installed = True and the COM
    add-in Connect = True paths as belt-and-suspenders. """
    # Regular XLA/XLL add-ins
    try:
        registered_xlls = []
        installed = []
        errors = []
        for addin in xl.AddIns:
            try:
                name = (addin.Name or "").upper()
                path = getattr(addin, "FullName", "") or getattr(addin, "Path", "") or ""
                is_factset = ("FACTSET" in name or "FDS" in name or name.startswith("FDSXL"))
                if not is_factset: continue

                # For XLL compiled add-ins, RegisterXLL is the correct loader.
                if name.endswith(".XLL") and path:
                    try:
                        ok = xl.RegisterXLL(path)
                        registered_xlls.append((addin.Name, path, ok))
                        continue
                    except Exception as e:
                        errors.append(f"RegisterXLL({addin.Name}): {e}")

                # For .xla add-ins, Installed = True works.
                if not addin.Installed:
                    try:
                        addin.Installed = True
                        installed.append(addin.Name)
                    except Exception as e:
                        errors.append(f"Installed=True on {addin.Name}: {e}")
            except Exception as e:
                errors.append(f"addin iter: {e}")
        log(f"  XLL registered: {registered_xlls}")
        if installed: log(f"  XLA enabled: {installed}")
        if errors: log(f"  add-in errors: {errors}")
    except Exception as e:
        log(f"  AddIns iteration failed: {e}")

    # COM add-ins (FactSet also ships one: FactSet.OfficeAddin.1)
    try:
        com_connected = []
        com_errors = []
        for com_addin in xl.COMAddIns:
            try:
                desc = ((com_addin.Description or "") + " " + (com_addin.ProgID or "")).upper()
                if "FACTSET" in desc or "FDS" in desc:
                    if not com_addin.Connect:
                        try:
                            com_addin.Connect = True
                            com_connected.append(com_addin.ProgID)
                        except Exception as e:
                            com_errors.append(f"Connect on {com_addin.ProgID}: {e}")
            except Exception:
                continue
        log(f"  COM add-ins connected: {com_connected}")
        if com_errors: log(f"  COM add-in errors: {com_errors}")
    except Exception as e:
        log(f"  COMAddIns iteration failed: {e}")

    # Self-test: can we evaluate _xll.FDS now?
    try:
        tmp_wb = xl.Workbooks.Add()
        tmp_ws = tmp_wb.Sheets(1)
        tmp_ws.Cells(1, 1).Formula = '=_xll.FDS("IBM-US","P_PRICE")'
        xl.Calculate()
        v = tmp_ws.Cells(1, 1).Value
        if _is_excel_error(v):
            log(f"  SELF-TEST FAILED: _xll.FDS returned error code {v} (#NAME? means add-in not loaded)")
        elif v is None:
            log("  SELF-TEST: _xll.FDS returned None (add-in may still be connecting)")
        else:
            log(f"  SELF-TEST OK: _xll.FDS('IBM-US','P_PRICE') = {v}")
        tmp_wb.Close(SaveChanges=False)
    except Exception as e:
        log(f"  Self-test failed with exception: {e}")


class ExcelSession:
    """Attach to the user's already-running Excel session (assumed to have
    Master List.xlsm already open with a live connection + FactSet add-in
    loaded). This avoids all the headless-Excel pitfalls (macros that fail
    with 1004 because of no UI context, add-ins that don't auto-load, etc).

    If the main Research Hub Upload.xlsx is open, we reuse that workbook;
    otherwise we open it. Same for Master List. We track what we opened
    ourselves vs. what was already open, and on exit we only close our own
    and never Quit() Excel (would kill the user's session)."""

    def __init__(self, main_path: Path, master_path: Path):
        self.main_path = main_path
        self.master_path = master_path
        self.xl = None
        self.wb = None
        self.master_wb = None
        # Track which workbooks the script opened vs. found already-open,
        # so on exit we close only the ones we opened.
        self._we_opened_main = False
        self._we_opened_master = False
        # Save/restore the user's global Calculation setting so we don't
        # leave their Excel in manual mode after we exit.
        self._saved_calc = None
        # Workbook NAMES (as known to Excel.Workbooks(...)) — stashed so
        # __exit__ can re-acquire the workbooks by name if the cached COM
        # proxies have gone stale after a long session.
        self._main_name = None
        self._master_name = None

    def __enter__(self):
        import win32com.client
        log("Attaching to running Excel instance...")
        self.xl = None
        # Try GetActiveObject first — cleanest way to attach to a running
        # Excel. If that fails or the attached object is broken (zombie
        # process from an earlier failed run), fall back to Dispatch which
        # will either find a working one or launch a new one.
        for attempt in (("GetActiveObject", lambda: win32com.client.GetActiveObject("Excel.Application")),
                        ("Dispatch",        lambda: win32com.client.Dispatch("Excel.Application"))):
            label, getter = attempt
            try:
                candidate = getter()
                # Health-check: try to read Workbooks. A zombie Excel will
                # raise AttributeError here even though the object exists.
                _ = candidate.Workbooks.Count
                self.xl = candidate
                log(f"  Attached via {label}")
                break
            except Exception as e:
                log(f"  {label} attach failed: {e}")
                continue
        if self.xl is None:
            raise RuntimeError("Could not attach to any working Excel instance — "
                               "kill any zombie EXCEL.EXE processes and make sure "
                               "your normal Excel with Master List is running.")
        # Only manage DisplayAlerts if we're clearly running in attached mode
        # with workbooks already open (i.e. user's session). Don't touch
        # Visible since the user's Excel is intentionally visible.
        try:
            self.xl.DisplayAlerts = False
        except Exception:
            pass

        # Don't touch Visible or DisplayAlerts on an attached user session —
        # they may have dialogs open we shouldn't suppress. But DO save and
        # change the Calculation setting while we work, so opening our
        # big workbook doesn't trigger a 15-minute auto-recalc.
        try:
            self._saved_calc = self.xl.Calculation
            self.xl.Calculation = CALC_MANUAL
        except Exception as e:
            log(f"  Could not set Calculation=Manual: {e}")

        # Find Master List. First look for any open workbook whose filename
        # starts with "Master List" — that's what the user has open, even
        # if its full path differs from our config (the user's real one
        # lives on a shared G: drive; the FS01 path is just a backup
        # fallback we open ourselves if nothing's already open).
        self.master_wb = self._find_open_by_name(["master list"])
        if self.master_wb is not None:
            log(f"  Master List: found open — {self.master_wb.Name}  ({self.master_wb.FullName})")
        else:
            self.master_wb = self._find_or_open(self.master_path, "master")
            if self.master_wb is not None:
                log(f"  Master List: opened COPY — {self.master_wb.Name}  (macros may fail; real one isn't open)")
            else:
                log(f"  Master List unavailable — rep-holdings refresh will be skipped")
        # Stash the name so __exit__ can re-acquire by name if the cached
        # proxy goes stale after a long session.
        try: self._master_name = self.master_wb.Name if self.master_wb else None
        except Exception: self._master_name = None

        # Find or open the main workbook
        self.wb = self._find_or_open(self.main_path, "main")
        if self.wb is None:
            raise RuntimeError(f"Could not open main workbook at {self.main_path}")
        try: self._main_name = self.wb.Name
        except Exception: self._main_name = None
        log(f"  Main workbook: {'found open' if not self._we_opened_main else 'opened'} — {self.wb.Name}")
        return self

    def _find_open_by_name(self, name_prefixes: list):
        """Return the first open Workbook whose filename (lowercased) starts
        with any of the given prefixes. Used to find workbooks that are
        already open regardless of what path we have configured."""
        for wb in self.xl.Workbooks:
            try:
                n = (wb.Name or "").lower()
                for pref in name_prefixes:
                    if n.startswith(pref.lower()):
                        return wb
            except Exception:
                continue
        return None

    def _find_or_open(self, path: Path, which: str):
        """Return the Workbook object for `path`. If it's already open in
        the attached Excel, return that; otherwise open it. Returns None
        if path doesn't exist."""
        if not path.exists():
            return None
        # Normalize path for comparison
        target = str(path).lower()
        for wb in self.xl.Workbooks:
            try:
                if (wb.FullName or "").lower() == target:
                    return wb
            except Exception:
                continue
        # Not already open — open it
        try:
            wb = self.xl.Workbooks.Open(str(path), UpdateLinks=False,
                                          ReadOnly=(which == "master"))
            if which == "main": self._we_opened_main = True
            else: self._we_opened_master = True
            return wb
        except Exception as e:
            log(f"  Failed to open {path}: {e}")
            return None

    # -- Refresh: rep holdings --
    def refresh_rep_holdings(self, try_macro: bool = True) -> None:
        """Refresh rep holdings via the LoadPositions macro. Now that we
        attach to the user's running Excel (which has Master List open and
        the data connection already established), this works reliably.

        If `try_macro=False` we skip the macro and just read whatever's in
        cols K-N — useful if Master List isn't available for some reason."""
        if self.master_wb is None:
            log("  (rep holdings: Master List not open — reading cached data)")
        elif try_macro:
            self._try_macro_refresh()
        else:
            log("  (rep holdings: --no-refresh-rep flag set, using cached data)")

        try:
            self.wb.Sheets("Rep Holdings").Calculate()
        except Exception as e:
            log(f"  Rep Holdings recalc failed: {e}")
        try:
            stamp = self.wb.Sheets("Rep Holdings").Cells(1, 4).Value
            log(f"  Rep Holdings D1: {stamp}")
        except Exception:
            pass

    def _try_macro_refresh(self) -> None:
        """Run Master List's OpenConnection → LoadPositions → CloseConnection
        on the actually-attached Master List workbook (whatever its exact
        filename is — "Master List.xlsm" or "Master List COPY.xlsm")."""
        # Build macro host-name from the actual Master List workbook we
        # attached to, so macros resolve against the right VBA project.
        host = self.master_wb.Name if self.master_wb is not None else "Master List.xlsm"
        def run_macro(name: str) -> bool:
            try:
                self.xl.Run(f"'{host}'!{name}")
                return True
            except Exception as e:
                log(f"    Run '{host}'!{name} failed: {e}")
                return False

        # CRITICAL: must target MASTER LIST's sheets, not the main workbook's.
        # Both workbooks have tabs called "Rep Holdings" and "Tx" (the main
        # workbook receives processed data the script writes), so mixing
        # them up silently runs the macros against the wrong workbook's
        # named ranges. We Activate explicitly so LoadPositions/LoadTransactions
        # — which read Range("DATA_START") off ActiveSheet — find the right
        # range.
        #
        # Note: the activate must happen AFTER OpenConnection. Trying to
        # Activate Master List's Rep Holdings sheet before the FactSet
        # connection is open throws a generic COM exception (-2147352567).
        # Once OpenConnection has brought Master List forward, subsequent
        # Activate calls succeed.
        master_name = self.master_wb.Name if self.master_wb is not None else None
        main_name = self.wb.Name if self.wb is not None else None

        # Re-acquire a workbook proxy by NAME from xl.Workbooks each call.
        # The cached COM proxies go stale after long-running macros like
        # OpenConnection's FactSet refresh, throwing -2147352567 even on
        # Sheets() lookups. Iterating Workbooks gives us a fresh proxy.
        def fresh_wb_by_name(target_name: str):
            if target_name is None:
                return None
            for _ in range(3):
                try:
                    for wb in self.xl.Workbooks:
                        try:
                            if wb.Name == target_name:
                                return wb
                        except Exception:
                            continue
                    return None
                except Exception:
                    time.sleep(1)
            return None

        # COM retry: Excel returns -2147418111 ("Call was rejected by callee",
        # RPC_E_SERVERCALL_RETRYLATER) when busy. Standard fix: retry with
        # a small backoff. Most other COM errors don't recover from a retry,
        # but it's cheap and only fires on this specific code.
        def com_retry(fn, attempts=5, delay=1.0):
            last = None
            for i in range(attempts):
                try:
                    return fn()
                except Exception as e:
                    last = e
                    msg = str(e)
                    # Retry only on "call rejected" / "server busy" patterns;
                    # propagate other errors immediately.
                    if "-2147418111" in msg or "rejected" in msg.lower() or "busy" in msg.lower():
                        time.sleep(delay * (i + 1))
                        continue
                    raise
            raise last  # type: ignore[misc]

        # Robust sheet-activator: tries several COM paths in order. Plain
        # Workbook.Activate() / Worksheet.Activate() reliably throws
        # -2147352567 ("Exception occurred") on Master List sheets when
        # called from python COM, even though the same calls work from
        # button click handlers. Application.Goto is the documented
        # navigation API and tends to succeed where Activate doesn't;
        # Window.Activate is a fallback for cases where the workbook
        # window is in some non-standard state. We log which path won so
        # we can simplify later. Returns True if any path left the right
        # sheet active.
        def force_active(sheet_name: str, target_wb_name: str) -> bool:
            wb = com_retry(lambda: fresh_wb_by_name(target_wb_name))
            if wb is None:
                log(f"  WARNING: workbook {target_wb_name} not found in xl.Workbooks")
                return False

            # Resolve the requested sheet name case-insensitively against the
            # workbook's actual sheet names. Master List uses "TX" (all caps)
            # while we ask for "Tx" — Sheets("Tx") then either fails or
            # returns something whose .Name doesn't match our verification
            # check, leading us to skip the macro on a sheet that *was*
            # already correctly active.
            actual_name = None
            try:
                names = []
                for s in wb.Sheets:
                    try: names.append(s.Name)
                    except Exception: continue
                for n in names:
                    if n.strip().lower() == sheet_name.strip().lower():
                        actual_name = n
                        break
                if actual_name is None:
                    log(f"  {target_wb_name}!{sheet_name} not found. "
                        f"Available sheets: {names}")
                    return False
                if actual_name != sheet_name:
                    log(f"  Resolved {sheet_name!r} -> actual name {actual_name!r}")
            except Exception as e:
                log(f"  Could not enumerate sheets on {target_wb_name}: {e}")
                return False

            try:
                sh = com_retry(lambda: wb.Sheets(actual_name))
            except Exception as e:
                log(f"  {target_wb_name}!{actual_name} not found: {e}")
                return False

            def check_active() -> bool:
                try:
                    ash = self.xl.ActiveSheet
                    # Case-insensitive comparison so "TX" == "Tx" passes.
                    return (ash.Name.strip().lower() == actual_name.strip().lower()
                            and ash.Parent.Name == target_wb_name)
                except Exception:
                    return False

            # Path 1: Application.Goto (canonical) — switches workbook,
            # sheet, AND scroll position in one call.
            try:
                com_retry(lambda: self.xl.Goto(sh.Range("A1"), True))
                if check_active():
                    log(f"  Activated {target_wb_name}!{actual_name} via Application.Goto")
                    return True
            except Exception as e:
                log(f"    Goto {target_wb_name}!{actual_name} failed: {e}")

            # Path 2: activate the workbook's window first, then the sheet.
            try:
                for w in self.xl.Windows:
                    try:
                        if w.Parent and w.Parent.Name == target_wb_name:
                            com_retry(lambda: w.Activate())
                            break
                    except Exception:
                        continue
                com_retry(lambda: sh.Activate())
                if check_active():
                    log(f"  Activated {target_wb_name}!{actual_name} via Window.Activate+Sheet.Activate")
                    return True
            except Exception as e:
                log(f"    Window+Sheet activate {target_wb_name}!{actual_name} failed: {e}")

            # Path 3: original Workbook.Activate + Sheet.Activate.
            try:
                com_retry(lambda: wb.Activate())
                com_retry(lambda: sh.Activate())
                if check_active():
                    log(f"  Activated {target_wb_name}!{actual_name} via Workbook.Activate+Sheet.Activate")
                    return True
            except Exception as e:
                log(f"    Workbook+Sheet activate {target_wb_name}!{actual_name} failed: {e}")

            log(f"  WARNING: could not activate {target_wb_name}!{actual_name} — "
                f"macro will likely 1004 because ActiveSheet is wrong; "
                f"current ActiveSheet={getattr(getattr(self.xl, 'ActiveSheet', None), 'Name', '?')}")
            return False

        log("Running OpenConnection macro...")
        opened = run_macro("OpenConnection")
        if opened:
            time.sleep(5)
            log("  OpenConnection done")
        else:
            log("  OpenConnection couldn't be run — trying LoadPositions anyway (connection may already be open)")

        # LoadPositions writes into the MAIN workbook's "Rep Holdings" tab
        # (Master List has no such sheet — confirmed by enumerating its
        # sheets). The macro lives in Master List but reads/writes via
        # ActiveSheet, so we must activate the main workbook's sheet.
        if main_name and force_active("Rep Holdings", main_name):
            log("Running LoadPositions macro...")
            if not run_macro("LoadPositions"):
                log("  LoadPositions failed — continuing with cached Rep Holdings data")
            else:
                log(f"Waiting {REP_WAIT_SECONDS}s for positions to populate...")
                time.sleep(REP_WAIT_SECONDS)
        else:
            log("  SKIPPING LoadPositions — Rep Holdings not active "
                "(running it now would corrupt the wrong sheet)")

        # LoadTransactions writes into the MAIN workbook's "Tx" tab — same
        # workbook as Rep Holdings. The L:Q helper-formula upload block
        # that read_transactions() reads from lives there. (Master List
        # also has a "TX" sheet but it's unrelated; activating it caused
        # the script to read stale data from main!Tx because main!Tx
        # never got refreshed.)
        if main_name and force_active("Tx", main_name):
            log("Running LoadTransactions macro...")
            if run_macro("LoadTransactions"):
                log("  Waiting 10s for transactions to populate...")
                time.sleep(10)
                wb_for_read = com_retry(lambda: fresh_wb_by_name(main_name))
                if wb_for_read is not None:
                    try:
                        com_retry(lambda: wb_for_read.Sheets("Tx").Calculate())
                        log("  Tx sheet recalc done")
                    except Exception as e:
                        log(f"  Tx recalc failed: {e}")
                    try:
                        stamp = com_retry(lambda: wb_for_read.Sheets("Tx").Cells(1, 4).Value)
                        log(f"  Tx D1: {stamp}")
                    except Exception:
                        pass
        else:
            log("  SKIPPING LoadTransactions — Tx not active "
                "(running it now would corrupt the wrong sheet)")

        if opened and run_macro("CloseConnection"):
            log("  CloseConnection done")

    # -- Refresh: FactSet --
    def refresh_factset(self) -> None:
        log("Triggering FactSet refresh...")
        for macro in ("FDS.Refresh", "FdsRefreshWorkbook", "FactSet.Refresh"):
            try:
                self.xl.Run(macro)
                log(f"  Ran macro: {macro}")
                break
            except Exception:
                pass
        # Always also do a full rebuild — forces _xll.FDS UDFs to recompute.
        try:
            self.xl.CalculateFullRebuild()
            log("  CalculateFullRebuild done")
        except Exception as e:
            log(f"  CalculateFullRebuild failed: {e}")
        log(f"Waiting {FACTSET_WAIT_SECONDS}s for FactSet to finish...")
        time.sleep(FACTSET_WAIT_SECONDS)
        # One more calc at the end to settle dependent cells.
        try:
            self.xl.Calculate()
        except Exception:
            pass

    def cell(self, sheet_name: str, row: int, col: int):
        """Read a cell's value, retrying on RPC_E_CALL_REJECTED which Excel
        throws when FactSet is in the middle of a background fetch. Up to
        6 attempts with exponential backoff (0.5s -> 16s)."""
        import pywintypes
        last_err = None
        for attempt in range(6):
            try:
                v = self.wb.Sheets(sheet_name).Cells(row, col).Value
                if v is None: return None
                if isinstance(v, str) and v.startswith("#"): return None
                return v
            except pywintypes.com_error as e:
                if e.hresult in (-2147418111, -2147417846):
                    time.sleep(0.5 * (2 ** attempt))
                    last_err = e
                    continue
                raise
        log(f"  cell({sheet_name} R{row}C{col}) failed after retries: {last_err}")
        return None

    def read_range(self, sheet_name: str, range_str: str):
        """Read a whole rectangular Range as a 2D list of cell values.
        ONE COM round trip instead of one-per-cell — typically 50-200x
        faster for sheets with hundreds of cells. Excel returns
        ((row1cells), (row2cells), ...) for multi-cell ranges or a
        single value for 1x1 ranges. Normalized here to a 2D list.

        Same retry logic as cell() for transient RPC_E_CALL_REJECTED.
        Empty cells come through as None."""
        import pywintypes
        last_err = None
        for attempt in range(6):
            try:
                raw = self.wb.Sheets(sheet_name).Range(range_str).Value
                if raw is None:
                    return [[None]]
                if not isinstance(raw, tuple):
                    return [[raw]]
                # Two cases:
                # - Multi-row range: tuple of tuples
                # - Single-row range: tuple of values
                if len(raw) > 0 and isinstance(raw[0], tuple):
                    return [list(row) for row in raw]
                return [list(raw)]
            except pywintypes.com_error as e:
                if e.hresult in (-2147418111, -2147417846):
                    time.sleep(0.5 * (2 ** attempt))
                    last_err = e
                    continue
                raise
        log(f"  read_range({sheet_name} {range_str}) failed after retries: {last_err}")
        return [[None]]

    def _refetch_wb(self, cached, name):
        """Return a live COM proxy to the workbook, re-acquiring from the
        Workbooks collection by name if the cached one has gone stale.
        Returns None if we can't find it any more. """
        # Probe the cached reference first — .Name is cheap and a stale
        # proxy raises here.
        if cached is not None:
            try:
                _ = cached.Name
                return cached
            except Exception:
                pass
        if not name or self.xl is None:
            return None
        try:
            return self.xl.Workbooks(name)
        except Exception:
            return None

    def __exit__(self, exc_type, exc_val, exc_tb):
        # IMPORTANT ordering: restore Calculation BEFORE closing workbooks,
        # and force Master List's FDSLIVE streaming cells to re-subscribe.
        # Otherwise the user's open Master List sheet keeps FDSLIVE cells
        # stuck at #NUM (they went dormant while we were in manual calc
        # and don't auto-resume on restore).
        try:
            # Force a full rebuild once calc is back on, so streaming UDFs
            # get their first recalc pulse.
            if self.xl is not None:
                self.xl.Calculation = CALC_AUTOMATIC
                try: self.xl.CalculateFullRebuild()
                except Exception: pass
        except Exception as e:
            log(f"Restore Calculation: {e}")

        # Poke Master List's sheets to resubscribe FDSLIVE streams. Toggling
        # EnableCalculation False→True marks the sheet dirty and re-evaluates
        # UDFs; this is the well-known Excel remedy for streaming cells
        # stuck after a manual-calc episode.
        #
        # After a long run the cached self.master_wb COM proxy can go stale
        # ("<unknown>.Worksheets"); re-fetch by name before iterating.
        master = self._refetch_wb(self.master_wb, self._master_name)
        if master is not None:
            # Retry the Worksheets iteration on RPC_E_CALL_REJECTED (-2147418111).
            # Excel is often still busy settling after FactSet's full rebuild;
            # it refuses COM calls for a few seconds, then recovers. Short
            # backoff loop handles this without a false failure log.
            RPC_REJECTED = -2147418111
            ok = False
            for attempt in range(5):
                try:
                    for ws in master.Worksheets:
                        try:
                            ws.EnableCalculation = False
                            ws.EnableCalculation = True
                        except Exception:
                            continue
                    log("  Resubscribed Master List FDSLIVE cells"
                        + (f" (attempt {attempt+1})" if attempt > 0 else ""))
                    ok = True
                    break
                except Exception as e:
                    # If it's the rejected-call error, wait and retry; otherwise bail.
                    is_rejected = getattr(e, "args", None) and RPC_REJECTED in e.args
                    if attempt < 4 and (is_rejected or "rejected" in str(e).lower()):
                        time.sleep(3 + attempt * 2)  # 3, 5, 7, 9 s
                        continue
                    log(f"  FDSLIVE resume failed: {e}")
                    break
            if not ok and attempt == 4:
                log("  FDSLIVE resume gave up after 5 attempts; refresh streaming cells manually if stuck at #NUM")
        elif self._master_name:
            log(f"  FDSLIVE resume skipped — could not re-find {self._master_name}")

        # Close only the workbooks we opened ourselves. Leave the user's
        # session + their open workbooks (Master List + anything else) alone.
        # Re-fetch by name in case the cached proxy went stale.
        if self._we_opened_main:
            main = self._refetch_wb(self.wb, self._main_name)
            if main is not None:
                try: main.Close(SaveChanges=False)
                except Exception as e: log(f"Close main: {e}")
        if self._we_opened_master:
            mx = self._refetch_wb(self.master_wb, self._master_name)
            if mx is not None:
                try: mx.Close(SaveChanges=False)
                except Exception as e: log(f"Close master: {e}")

        # Final: restore user's ORIGINAL calculation setting (in case they
        # had Manual on purpose). We already toggled Automatic above to
        # wake streaming; now honor whatever they had.
        if self._saved_calc is not None and self._saved_calc != CALC_AUTOMATIC:
            try: self.xl.Calculation = self._saved_calc
            except Exception: pass

        # Never Quit() — that would kill the user's whole Excel session.
        self.wb = self.master_wb = self.xl = None


# ----------------------------------------------------------------------
# Sheet readers (unchanged from first version except rep holdings)
# ----------------------------------------------------------------------
def _num(v) -> float | None:
    if v is None or v == "": return None
    if isinstance(v, str) and v.startswith("#"): return None
    if _is_excel_error(v): return None   # guards against #NAME?/#N/A etc.
    try: return float(v)
    except (TypeError, ValueError): return None


def _str(v) -> str | None:
    """Coerce cell value to a stripped string, filtering errors/None."""
    if v is None: return None
    if _is_excel_error(v): return None
    if isinstance(v, str) and v.startswith("#"): return None
    s = str(v).strip()
    return s if s else None


# Column-position to storage-key map for the Prices sheet. The
# spreadsheet column header is "TODAY" (FactSet's name); we store it
# under "1D" so it aligns with the Markets Dashboard convention used by
# the Snapshot tile's benchmark rows.
PRICES_PERF_KEYS = ["1D", "5D", "MTD", "1M", "QTD", "3M", "6M", "YTD", "1Y", "2Y", "3Y"]

def read_prices(xl: ExcelSession) -> dict[str, dict]:
    """Returns { upper_ticker: {price, perf, perf5d} } for every populated row.

    Layout (27 columns, A..AA):
        A: Company       B: Ord Ticker   C: Ord Price
        D..N: 11 ord trailing returns (TODAY, 5D, MTD, 1M, QTD, 3M, 6M,
                                       YTD, 1Y, 2Y, 3Y)
        O: US Ticker     P: US Price
        Q..AA: 11 US trailing returns (same windows)

    Each ticker entry stores:
        price   — float or None
        perf    — dict mapping window key → decimal (0.012 for 1.2%)
        perf5d  — string form of the 5D value (legacy, e.g. "1.2"),
                  preserved so older clients keep rendering until they
                  re-read the full perf object.

    Single bulk range read — much faster than the per-cell loop."""
    out: dict[str, dict] = {}
    rows = xl.read_range("Prices", f"A2:AA{MAX_COMPANY_ROW}")
    # Indexed offsets into each row for the two ticker blocks:
    ORD_PRICE_IDX = 2
    ORD_PERF_START = 3
    US_TICKER_IDX = 14
    US_PRICE_IDX = 15
    US_PERF_START = 16
    NUM_PERF_COLS = len(PRICES_PERF_KEYS)  # 11

    def parse_perf_block(row, start: int) -> dict:
        """Read NUM_PERF_COLS cells starting at `start`.

        Auto-detects whether the sheet values are percent-form (1.2 for
        1.2%) or decimal-form (0.012 for 1.2%). Excel cells formatted
        as Percentage store the underlying decimal (0.012) but display
        '1.2%'; cells formatted as Number store 1.2 directly. Both
        formats are common in FactSet templates; we pick the right
        interpretation per row by looking at the magnitude of values
        in the block:

           max(|v|) >= 1.5  →  percent-form, divide by 100
           max(|v|) <  1.5  →  decimal-form, use as-is

        The 1.5 threshold means a row of returns where any window
        exceeds ~1.5 (i.e. >150% if decimal would be implausible,
        whereas 1.5%+ is unremarkable in percent form) trips the
        percent-form path. Returns the dict of populated entries.

        Returns are stored as DECIMALS in the perf object (0.012 for
        1.2%) so the display layer just multiplies by 100. """
        raw_values = []
        for i, _ in enumerate(PRICES_PERF_KEYS):
            idx = start + i
            if idx >= len(row): break
            v = _num(row[idx])
            raw_values.append(v)
        finite = [abs(v) for v in raw_values if v is not None]
        if not finite:
            return {}
        is_percent_form = max(finite) >= 1.5
        block: dict = {}
        for i, key in enumerate(PRICES_PERF_KEYS):
            if i >= len(raw_values): break
            v = raw_values[i]
            if v is None: continue
            block[key] = round(v / 100 if is_percent_form else v, 6)
        return block

    for row in rows:
        if len(row) < 3: continue
        ord_tk = _str(row[1])
        if ord_tk:
            price = _num(row[ORD_PRICE_IDX]) if len(row) > ORD_PRICE_IDX else None
            perf  = parse_perf_block(row, ORD_PERF_START)
            entry: dict = {"price": price, "perf": perf}
            # Legacy: write perf5d (string, percent-form) for back-compat.
            if "5D" in perf:
                entry["perf5d"] = f"{perf['5D'] * 100:.2f}"
            if price is not None or perf:
                out[ord_tk.upper()] = entry
        if len(row) > US_TICKER_IDX:
            us_tk = _str(row[US_TICKER_IDX])
            if us_tk:
                us_price = _num(row[US_PRICE_IDX]) if len(row) > US_PRICE_IDX else None
                us_perf  = parse_perf_block(row, US_PERF_START)
                us_entry: dict = {"price": us_price, "perf": us_perf}
                if "5D" in us_perf:
                    us_entry["perf5d"] = f"{us_perf['5D'] * 100:.2f}"
                if us_price is not None or us_perf:
                    out[us_tk.upper()] = us_entry
    log(f"  Prices: {len(out)} tickers")
    return out


def read_valuation(xl: ExcelSession) -> dict[str, dict]:
    """Bulk-read Valuation A..Q for all rows."""
    out: dict[str, dict] = {}
    def s(v):
        if v is None: return None
        if isinstance(v, (int, float)): return str(round(float(v), 4))
        return str(v).strip()
    rows = xl.read_range("Valuation", f"A2:Q{MAX_COMPANY_ROW}")
    for row in rows:
        # Padded so A=row[0], Q=row[16]
        while len(row) < 17: row.append(None)
        tk = _str(row[0])
        if not tk: continue
        tk = tk.upper()
        patch: dict = {}
        for label, idx in (("peCurrent", 4), ("peLow5", 5), ("peHigh5", 6),
                            ("peAvg5", 7), ("peMed5", 8)):
            v = _num(row[idx])
            if v is not None: patch[label] = s(v)
        fy_month = _excel_date_to_month_name(row[9])
        if fy_month: patch["fyMonth"] = fy_month
        ccy = _str(row[10])
        if ccy: patch["currency"] = ccy.upper()
        fy1 = _excel_date_to_fy_label(row[11])
        if fy1: patch["fy1"] = fy1
        eps1 = _num(row[12])
        if eps1 is not None: patch["eps1"] = s(eps1)
        w1 = _num(row[13])
        if w1 is not None: patch["w1"] = s(w1)
        fy2 = _excel_date_to_fy_label(row[14])
        if fy2: patch["fy2"] = fy2
        eps2 = _num(row[15])
        if eps2 is not None: patch["eps2"] = s(eps2)
        w2 = _num(row[16])
        if w2 is not None: patch["w2"] = s(w2)
        if patch: out[tk] = patch
    log(f"  Valuation: {len(out)} tickers")
    return out


def _excel_date_to_month_name(v) -> str | None:
    if v is None or v == "": return None
    try:
        if hasattr(v, "month"): m = v.month
        elif isinstance(v, (int, float)): m = _excel_serial_to_date(v).month
        else: return None
        return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1]
    except Exception: return None


def _excel_date_to_fy_label(v) -> str | None:
    if v is None or v == "": return None
    try:
        if hasattr(v, "year"): return f"FY{v.year}E"
        if isinstance(v, (int, float)): return f"FY{_excel_serial_to_date(v).year}E"
        return None
    except Exception: return None


def _excel_serial_to_date(serial: float):
    from datetime import datetime, timedelta
    return datetime(1899, 12, 30) + timedelta(days=int(serial))


def read_earnings_dates(xl: ExcelSession) -> dict[str, dict]:
    """Bulk-read cols D..N. 11 columns matching the new manual upload:
       D=Ticker, E=Next Rpt Date, F=Last Rpt Date,
       G=Sales Est (last Q), H=Sales Actual, I=Sales Surp Nom, J=Sales Surp %,
       K=EPS Est (last Q), L=EPS Actual, M=EPS Surp Nom, N=EPS Surp %,
       O=Sales+1 Est, P=EPS+1 Est.
       (G..N apply to the LAST quarter; O,P are consensus heading INTO
       the next quarter.) All fields after F are optional — sheets that
       still only populate D..F continue to work unchanged."""
    out: dict[str, dict] = {}
    rows = xl.read_range("Earnings Dates", f"D2:P{MAX_COMPANY_ROW}")
    for row in rows:
        while len(row) < 13: row.append(None)
        tk = _str(row[0])
        if not tk: continue
        nxt = _any_date_to_iso(row[1])
        last = _any_date_to_iso(row[2])
        rec: dict = {"next": nxt, "last": last}
        # Optional last-quarter estimate / actual / surprise. _num returns
        # None for blank / #N/A / non-numeric, so we only emit a key when
        # there's a real value.
        if (v := _num(row[3]))  is not None: rec["salesEst"]     = v
        if (v := _num(row[4]))  is not None: rec["salesActual"]  = v
        if (v := _num(row[5]))  is not None: rec["salesSurpNom"] = v
        if (v := _num(row[6]))  is not None: rec["salesSurpPct"] = v
        if (v := _num(row[7]))  is not None: rec["epsEst"]       = v
        if (v := _num(row[8]))  is not None: rec["epsActual"]    = v
        if (v := _num(row[9]))  is not None: rec["epsSurpNom"]   = v
        if (v := _num(row[10])) is not None: rec["epsSurpPct"]   = v
        if (v := _num(row[11])) is not None: rec["nextSalesEst"] = v
        if (v := _num(row[12])) is not None: rec["nextEpsEst"]   = v
        # Only emit the row if SOMETHING populated.
        if any(rec.values()):
            out[tk.upper()] = rec
    log(f"  Earnings dates: {len(out)} tickers")
    return out


def _any_date_to_iso(raw) -> str | None:
    """Coerce an Excel cell value to ISO YYYY-MM-DD, or None."""
    if raw is None or raw == "": return None
    try:
        # pywintypes.datetime / datetime.datetime
        if hasattr(raw, "year") and hasattr(raw, "month") and hasattr(raw, "day"):
            return f"{raw.year:04d}-{raw.month:02d}-{raw.day:02d}"
        if isinstance(raw, (int, float)):
            n = int(raw)
            # YYYYMMDD integer (e.g. 20260505)
            if 19000000 <= n <= 21001231:
                y, m, d = n // 10000, (n // 100) % 100, n % 100
                return f"{y:04d}-{m:02d}-{d:02d}"
            # Excel serial day number (e.g. 46147 for 2026-05-05)
            if 0 < n < 100000:
                d = _excel_serial_to_date(n)
                return f"{d.year:04d}-{d.month:02d}-{d.day:02d}"
        if isinstance(raw, str) and raw and not raw.startswith("#"):
            # Try parse common date strings
            for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%-m/%-d/%Y"):
                try:
                    dt = datetime.strptime(raw, fmt)
                    return f"{dt.year:04d}-{dt.month:02d}-{dt.day:02d}"
                except ValueError:
                    continue
    except Exception:
        pass
    return None


def read_fx(xl: ExcelSession) -> dict[str, float]:
    """Bulk-read FX A..B for up to 60 rows."""
    out: dict[str, float] = {}
    rows = xl.read_range("FX", "A2:B60")
    for row in rows:
        while len(row) < 2: row.append(None)
        pair = _str(row[0])
        rate = _num(row[1])
        if not pair or rate is None or rate == 0: continue
        pair = pair.upper()
        if pair.endswith("USD") and len(pair) == 6:
            ccy = pair[:3]
            out[ccy] = round(1.0 / rate, 6) if rate else None
    log(f"  FX: {len(out)} currencies")
    return out


def _resolve_perf_sheet(xl: ExcelSession) -> str:
    """Return whichever performance sheet name exists in the workbook.
    User may rename Performance1 -> Perf1 to save tab space."""
    for candidate in ("Perf1", "Performance1"):
        try:
            xl.wb.Sheets(candidate)
            return candidate
        except Exception:
            continue
    return "Performance1"  # default (will error in reads if truly absent)


def read_performance1(xl: ExcelSession) -> dict[str, dict[str, float]]:
    """Bulk-read just rows 1-2 across cols A..AM (sheet has headers in row
    1 and current month's MTD values in row 2)."""
    _PERF_SHEET = _resolve_perf_sheet(xl)
    rows = xl.read_range(_PERF_SHEET, "A1:AM2")
    if len(rows) < 2: return {"GL": {}, "FGL": {}, "IN": {}, "FIN": {}, "EM": {}, "SC": {}}
    headers = rows[0]
    values = rows[1]
    out: dict[str, dict[str, float]] = {"GL": {}, "FGL": {}, "IN": {}, "FIN": {}, "EM": {}, "SC": {}}
    GROUPS = {"GL":["GL","FGL"], "IN":["IN","FIN"], "EM":["EM"], "SC":["SC"]}
    def grab(group, col_idx):
        if col_idx >= len(headers) or col_idx >= len(values): return
        name = _str(headers[col_idx])
        ret = _num(values[col_idx])
        if name and ret is not None:
            for p in GROUPS[group]:
                out[p][name] = ret
    # Col indices are 0-based here. Convert from old 1-based (col 4=index 3).
    for c in (3, 4, 5, 6, 7, 8): grab("GL", c)
    for c in range(13, 20):       grab("IN", c)
    for c in range(23, 30):       grab("EM", c)
    for c in range(33, 39):       grab("SC", c)
    total = sum(len(v) for v in out.values())
    log(f"  Performance1: {total} series-months")
    return out


def read_rep_holdings(xl: ExcelSession) -> dict[str, dict[str, dict]]:
    """Returns {portfolio_key: {ticker: {shares, avgCost}}}.

    Reads the user's K-N parsing columns on the Rep Holdings sheet:
      K = Portfolio code (LWGA0013, LWFOCGL1, ...)
      L = Ticker (VLOOKUP'd to clean form)
      M = Shares (or market value for CASH/DIVACC)
      N = Avg cost per share (or 1 for CASH/DIVACC)

    Portfolio code mapping matches the app's REP_ACCOUNTS constant. """
    rep_accounts = {
        "LWGA0013": "GL", "LWFOCGL1": "FGL", "LWIV0004": "IN",
        "LWIF0001": "FIN", "LWEA0001": "EM", "LWSC0003": "SC",
    }
    out: dict[str, dict[str, dict]] = {k: {} for k in rep_accounts.values()}

    # Bulk-read cols K..N for the whole rep-holdings range. ~3000 rows
    # × 4 cells = 12000 COM calls would have been; now it's 1.
    rows = xl.read_range("Rep Holdings", f"K4:N{MAX_REP_HOLDINGS_ROW}")
    for row in rows:
        while len(row) < 4: row.append(None)
        port_code = _str(row[0])
        if not port_code: continue
        port_key = rep_accounts.get(port_code.upper())
        if not port_key: continue
        ticker = _str(row[1])
        shares = _num(row[2])
        avg = _num(row[3])
        if not ticker or shares is None: continue
        # Same ticker can appear multiple times for one portfolio (most
        # commonly CASH split into multiple line items, or DIVACC + cash
        # adjustments). Sum the shares and take a shares-weighted average
        # of avg cost so we match the manual Rep Holdings import.
        tk = ticker.upper()
        prev = out[port_key].get(tk)
        if prev:
            prev_shares = prev.get("shares") or 0
            prev_cost   = prev.get("avgCost") or 0
            new_shares = prev_shares + shares
            this_cost = avg if avg is not None else 0
            if new_shares > 0:
                new_avg = ((prev_shares * prev_cost) + (shares * this_cost)) / new_shares
            else:
                new_avg = this_cost
            out[port_key][tk] = {"shares": new_shares, "avgCost": new_avg}
        else:
            out[port_key][tk] = {"shares": shares, "avgCost": avg if avg is not None else 0}

    total = sum(len(v) for v in out.values())
    log(f"  Rep Holdings: {total} positions across {sum(1 for v in out.values() if v)} portfolios")
    return out


# Transactions — LoadTransactions macro writes raw recordset to Tx!A4:G<n>,
# and the user has helper formulas in H:J and a final upload block in L:Q
# with columns: Date, Security, Portfolio, Shares, Price, Amount. Portfolio
# is a LW account code (e.g. LWSC0003) which we map to the short code (SC)
# matching the app's REP_ACCOUNTS constant. Typically 0-20 rows of
# yesterday's trades; bounded at 500 for safety.
MAX_TX_ROW = 500

def read_transactions(xl: "ExcelSession") -> list[dict]:
    rep_accounts = {
        "LWGA0013": "GL", "LWFOCGL1": "FGL", "LWIV0004": "IN",
        "LWIF0001": "FIN", "LWEA0001": "EM", "LWSC0003": "SC",
    }
    rows = xl.read_range("Tx", f"L4:Q{MAX_TX_ROW}")
    out: list[dict] = []
    for row in rows:
        while len(row) < 6: row.append(None)
        date = _any_date_to_iso(row[0])
        name = _str(row[1])
        port_raw = _str(row[2])
        shares = _num(row[3])
        price  = _num(row[4])
        amount = _num(row[5])
        if not date or not name: continue
        port = rep_accounts.get((port_raw or "").upper())
        if not port: continue
        if shares is None: continue
        out.append({
            "date": date,
            "name": name.strip(),
            "portfolio": port,
            "shares": shares,
            "price":  price  if price  is not None else 0.0,
            "amount": amount if amount is not None else 0.0,
        })
    log(f"  Transactions: {len(out)} rows")
    return out


# Mirrors the JS normalize() in src/hooks/useImport.js applyTxImport. Strips
# common corporate suffixes and punctuation so "Shell Plc" and "SHELL PLC"
# and "Shell, PLC" all normalize to the same key.
_TX_STOPWORDS_LONG = re.compile(
    r"\b(corporation|incorporated|international|holdings|holding|company|"
    r"limited|group|ordinary|preferred|shares|class|depositary|depository|"
    r"receipts|receipt|common|stock)\b"
)
_TX_STOPWORDS_SHORT = re.compile(
    r"\b(co\.|inc\.|ltd\.|llc|plc|sa|ag|nv|se|co|inc|ltd|corp|gmbh|kgaa|ab|"
    r"asa|oyj|spa|srl|bv|ord|com|adr|ads|gdr|pref|reit|shs|npv|cdi|cva|"
    r"units|unit|jsc|pjsc|ojsc|oao|sab|bhd|tbk)\b"
)
_TX_PUNCT = re.compile(r"[.,&'()\-\/]")

def _normalize_tx_name(n: str | None) -> str:
    s = (n or "").lower()
    s = _TX_STOPWORDS_LONG.sub("", s)
    s = _TX_STOPWORDS_SHORT.sub("", s)
    s = _TX_PUNCT.sub(" ", s)
    return re.sub(r"\s+", " ", s).strip()


def _tx_key(t: dict) -> str:
    """Composite dedupe key matching the JS importer. Uses default
    number-to-string formatting so 0 -> "0" not "0.0", to match JS."""
    def n(v):
        if v is None or v == "": return "0"
        try:
            f = float(v)
            return str(int(f)) if f == int(f) else str(f)
        except Exception:
            return "0"
    return (t.get("date") or "") + "|" + (t.get("portfolio") or "") + \
           "|" + n(t.get("shares")) + "|" + n(t.get("price")) + "|" + n(t.get("amount"))


def merge_transactions(companies: list[dict], tx_rows: list[dict]) -> tuple[int, int, list[str]]:
    """Append new transactions onto each company's transactions array,
    deduping by composite key. Mirrors applyTxImport in useImport.js.
    Returns (added_count, matched_companies_count, unmatched_names)."""
    if not tx_rows:
        return (0, 0, [])
    by_name: dict[str, list[dict]] = {}
    by_norm: dict[str, list[dict]] = {}
    for r in tx_rows:
        k = (r["name"] or "").lower().strip()
        by_name.setdefault(k, []).append(r)
        by_norm.setdefault(_normalize_tx_name(r["name"]), []).append(r)

    matched_names: set[str] = set()
    added = 0
    matched_cos = 0
    for c in companies:
        cname = (c.get("name") or "").lower().strip()
        cus   = (c.get("usTickerName") or "").lower().strip()
        matches = (by_name.get(cname)
                   or (cus and by_name.get(cus))
                   or by_norm.get(_normalize_tx_name(c.get("name")))
                   or (cus and by_norm.get(_normalize_tx_name(c.get("usTickerName")))))
        if not matches: continue
        for r in matches:
            matched_names.add(r["name"])
        existing = c.get("transactions") or []
        exist_keys = { _tx_key(t) for t in existing }
        new_tx = []
        for r in matches:
            if _tx_key(r) in exist_keys: continue
            new_tx.append({
                "id": _new_uuid(),
                "date": r["date"],
                "portfolio": r["portfolio"],
                "shares": r["shares"],
                "price":  r["price"],
                "amount": r["amount"],
                "type": "BUY" if r["shares"] >= 0 else "SELL",
            })
        if not new_tx: continue
        added += len(new_tx)
        matched_cos += 1
        all_tx = existing + new_tx
        all_tx.sort(key=lambda t: t.get("date") or "", reverse=True)
        c["transactions"] = all_tx

    unmatched = sorted({ r["name"] for r in tx_rows } - matched_names)
    return (added, matched_cos, unmatched)


# Metrics tab — new layout with "current" (LTM / no suffix) column before
# each +1/+2 pair. 44 metric columns total (A=Company, B=Ord Ticker,
# C=MktCap, D..AI=33 original metrics, AJ..AR=new P/B + ROE triplets +
# 3 growth singles). Trailing returns moved to the Prices upload.
METRICS_COLS = [
    ("mktCap",  3,  False),  # C  — $B
    ("fpe",     4,  False),  # D  — current P/E
    ("fpe1",    5,  False),  # E
    ("fpe2",    6,  False),  # F
    ("fcfYld",  7,  True),   # G  — current
    ("fcfYld1", 8,  True),   # H
    ("fcfYld2", 9,  True),   # I
    ("divYld",  10, True),   # J  — current
    ("divYld1", 11, True),   # K
    ("divYld2", 12, True),   # L
    ("payout",  13, False),  # M  — current (ratio)
    ("payout1", 14, False),  # N
    ("payout2", 15, False),  # O
    ("netDE",   16, False),  # P  — current
    ("netDE1",  17, False),  # Q
    ("netDE2",  18, False),  # R
    ("intCov",  19, False),  # S
    ("ltEPS",   20, True),   # T
    ("grMgn",   21, True),   # U  — current
    ("grMgn1",  22, True),   # V
    ("grMgn2",  23, True),   # W
    ("netMgn",  24, True),   # X  — current
    ("netMgn1", 25, True),   # Y
    ("netMgn2", 26, True),   # Z
    ("gpAss",   27, False),  # AA — current
    ("gpAss1",  28, False),  # AB
    ("gpAss2",  29, False),  # AC
    ("npAss",   30, False),  # AD — current
    ("npAss1",  31, False),  # AE
    ("npAss2",  32, False),  # AF
    ("opROE",   33, False),  # AG — current
    ("opROE1",  34, False),  # AH
    ("opROE2",  35, False),  # AI
    # New P/B + ROE triplets (current, +1, +2) and three growth singles.
    # The JS-side Metrics import expects these at AJ..AR, matching
    # METRIC_KEYS_NEW in src/hooks/useImport.js.
    ("pb",      36, False),  # AJ
    ("pb1",     37, False),  # AK
    ("pb2",     38, False),  # AL
    ("roe",     39, True),   # AM — current ROE (percent)
    ("roe1",    40, True),   # AN
    ("roe2",    41, True),   # AO
    ("intGr",   42, True),   # AP — internal growth rate (percent)
    ("adpsGr5", 43, True),   # AQ — 5Y ADPS growth
    ("adpsGr1", 44, True),   # AR — 1Y ADPS growth
]
def read_metrics(xl: ExcelSession) -> dict[str, dict]:
    """Bulk-read the Metrics tab — A..AR covers Company + Ord Ticker +
    42 metric columns (original 33 + new P/B/ROE/growth 9). Trailing
    returns moved to the Prices tab per ticker, so they're not read
    here.

    Single bulk range read — was 14000 COM calls before, now 1."""
    out: dict[str, dict] = {}
    rows = xl.read_range("Metrics", f"A2:AR{MAX_COMPANY_ROW}")
    for row in rows:
        if len(row) < 3: continue
        tk = _str(row[1])  # col B = ord ticker
        if not tk: continue
        m: dict = {}
        for key, col, _pct in METRICS_COLS:
            idx = col - 1  # METRICS_COLS uses 1-based col numbers
            if idx < len(row):
                v = _num(row[idx])
                if v is not None:
                    m[key] = v
        if m: out[tk.upper()] = m
    log(f"  Metrics: {len(out)} tickers")
    return out


# Markets dashboard structure (new layout): row 1 headers, rows 2+ data.
# Col A=Section, B=Label, C=Ticker, D..J=7 timeframe returns (1D..3Y).
# Sections: Indices, Sectors, Countries, Commodities, Bonds.
# FX matrix blocks appear inline in col A with a "FX - 3M" / "FX - 12M"
# label, followed by a col-header row (">" in A, currencies in B-F) and
# 5 data rows (row-currency in A, values in B-F with blank diagonals).
MARKETS_SECTIONS = {
    "indices":     "Indices",
    "sectors":     "Sectors",
    "countries":   "Countries",
    "commodities": "Commodities",
    "bonds":       "Bonds",
    "fx":          "FX",
}
MARKETS_SCAN_MAX_ROW = 200   # generous upper bound; scan stops at first blank Section run
# Dashboard layout: Section / Label / Ticker / TODAY / 5D / MTD / 1M /
# QTD / 3M / 6M / YTD / 1Y / 2Y / 3Y. Column letters D..N (indices 3..13
# zero-based, 4..14 one-based as below). The TODAY column is stored
# under "1D" so it aligns with the existing benchmark-row reads.
MARKETS_PERIOD_COLS = [
    ("1D",  4),   # D = TODAY
    ("5D",  5),
    ("MTD", 6),
    ("1M",  7),
    ("QTD", 8),
    ("3M",  9),
    ("6M", 10),
    ("YTD",11),
    ("1Y", 12),
    ("2Y", 13),
    ("3Y", 14),
]


def read_markets(xl: ExcelSession) -> dict:
    """Bulk-read Dashboard A..J for the entire scan range, then iterate
    in-memory to detect sections and FX matrix blocks. Was thousands of
    COM calls, now 1."""
    snap = {"asOf": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    buckets = {key: [] for key in MARKETS_SECTIONS.keys()}
    section_lookup = {name.lower(): key for key, name in MARKETS_SECTIONS.items()}
    fx_matrices: dict = {}
    import re as _re
    _FX_PAT = _re.compile(r"FX\s*[-_]?\s*(3M|12M)", _re.IGNORECASE)

    # Single bulk read. Range expanded from A..J to A..N to cover the
    # 14-column layout (Section + Label + Ticker + 11 period columns).
    grid = xl.read_range("Dashboard", f"A2:N{MARKETS_SCAN_MAX_ROW}")
    # grid[i] is the i-th data row; row index in workbook = i + 2
    n = len(grid)
    i = 0
    blank_streak = 0
    while i < n:
        row = grid[i]
        while len(row) < 14: row.append(None)
        section_raw = row[0]
        if section_raw is None or (isinstance(section_raw, str) and not section_raw.strip()):
            blank_streak += 1
            if blank_streak >= 10: break
            i += 1
            continue
        blank_streak = 0
        section_str = str(section_raw).strip()

        # FX matrix block?
        m = _FX_PAT.search(section_str)
        if m:
            period = m.group(1).upper()
            # Column-header row = next non-blank row in our slice
            j = i + 1
            while j < n:
                hdr_row = grid[j]
                hdr_first = hdr_row[0] if hdr_row else None
                if hdr_first is not None and (not isinstance(hdr_first, str) or hdr_first.strip()):
                    break
                j += 1
            if j >= n: i = n; continue
            hdr_row = grid[j]
            while len(hdr_row) < 7: hdr_row.append(None)
            # cols B..F (indices 1..5). Filter blanks.
            col_labels = []
            for c in range(1, 6):
                v = hdr_row[c]
                if v: col_labels.append(str(v).strip())
            # Data: next 5 rows
            rows_data = []
            for dr in range(j + 1, min(j + 1 + 5, n)):
                drow = grid[dr]
                while len(drow) < 7: drow.append(None)
                row_label = drow[0]
                if not row_label: continue
                values = []
                for c in range(1, 1 + len(col_labels)):
                    values.append(_num(drow[c]))
                rows_data.append({"label": str(row_label).strip(), "values": values})
            fx_matrices[period] = {"cols": col_labels, "rows": rows_data}
            i = j + 1 + 5
            continue

        section_key = section_lookup.get(section_str.lower())
        if section_key:
            label = row[1]
            if label:
                ticker = row[2]
                row_obj = {"label": str(label), "ticker": str(ticker) if ticker else None}
                for period, c in MARKETS_PERIOD_COLS:
                    idx = c - 1
                    row_obj[period] = _num(row[idx]) if idx < len(row) else None
                buckets[section_key].append(row_obj)
        i += 1

    for key, rows in buckets.items():
        snap[key] = rows
        log(f"  Markets/{key}: {len(rows)} rows")

    if fx_matrices.get("3M"):
        snap["fxMatrix3M"] = fx_matrices["3M"]
    if fx_matrices.get("12M"):
        snap["fxMatrix12M"] = fx_matrices["12M"]
    # Back-compat flat "vs USD" lists (col 0 of each matrix)
    def _vs_usd(block):
        if not block: return []
        out = []
        for row in block["rows"]:
            v = row["values"][0] if row["values"] else None
            if row.get("label") and v is not None:
                out.append({"label": row["label"], "value": v})
        return out
    snap["fx3M"] = _vs_usd(fx_matrices.get("3M"))
    snap["fx12M"] = _vs_usd(fx_matrices.get("12M"))
    if fx_matrices:
        log(f"  Markets/fx: matrix 3M={bool(fx_matrices.get('3M'))} 12M={bool(fx_matrices.get('12M'))}")
    return snap


# ----------------------------------------------------------------------
# Merge helpers
# ----------------------------------------------------------------------
def merge_metrics(companies: list[dict], metrics: dict[str, dict]) -> int:
    """Attach metrics dict to each matching company under `.metrics`.
    Matches by any ticker on the company."""
    n = 0
    for c in companies:
        all_tks = [(t.get("ticker") or "").upper() for t in (c.get("tickers") or [])]
        if not all_tks and c.get("ticker"):
            all_tks.append(c["ticker"].upper())
        for tk in all_tks:
            if tk in metrics:
                c["metrics"] = metrics[tk]
                n += 1
                break
    return n


def merge_companies(companies, prices, valuations, earnings):
    n_p = n_v = n_e = 0
    for c in companies:
        all_tks = []
        for t in (c.get("tickers") or []):
            tk = (t.get("ticker") or "").upper()
            if tk: all_tks.append(tk)
        if not all_tks and c.get("ticker"):
            all_tks.append(c["ticker"].upper())

        # Prices — each ticker gets its own price + perf object (11
        # trailing windows in decimal form). Legacy perf5d string is
        # also written for back-compat with older clients.
        any_p = False
        for t in (c.get("tickers") or []):
            tk = (t.get("ticker") or "").upper()
            if tk in prices:
                p = prices[tk]
                if p.get("price") is not None: t["price"] = p["price"]
                if p.get("perf"):              t["perf"]  = p["perf"]
                if p.get("perf5d") is not None: t["perf5d"] = p["perf5d"]
                any_p = True
        if any_p: n_p += 1

        # Valuation (take first ticker that has data)
        for tk in all_tks:
            if tk in valuations:
                v = c.setdefault("valuation", {})
                v.update(valuations[tk])
                ord_t = next((t for t in (c.get("tickers") or []) if t.get("isOrdinary")), None)
                if ord_t and ord_t.get("price") is not None:
                    v["price"] = ord_t["price"]
                n_v += 1
                break

        # Earnings dates + estimates / actuals.
        # - NEXT entry: store the report date + (when present) the
        #   Sales+1 / EPS+1 consensus heading INTO the report.
        # - LAST entry: stash the date on the company AND attach the
        #   sales/eps estimate/actual/surprise fields to the entry whose
        #   reportDate matches lastDate (creating a closed entry if none
        #   exists, so post-report data has somewhere to live).
        for tk in all_tks:
            if tk in earnings:
                info = earnings[tk]
                nxt = info.get("next")
                last = info.get("last")
                entries = c.setdefault("earningsEntries", [])

                def _new_entry(date):
                    return {
                        "id": _new_uuid(),
                        "quarter": "", "reportDate": date, "eps": "",
                        "tpChange": "Unchanged", "newTP": "", "tpRationale": "",
                        "bullets": ["", "", "", "", ""], "shortTakeaway": "",
                        "extendedTakeaway": "", "thesisStatus": "On track",
                        "thesisNote": "", "open": False,
                    }

                if nxt:
                    found = next((e for e in entries if _same_date(e.get("reportDate"), nxt)), None)
                    if found is None:
                        placeholder = next((e for e in entries
                                            if not e.get("eps") and not e.get("shortTakeaway")
                                            and not e.get("reportDate")), None)
                        if placeholder:
                            placeholder["reportDate"] = nxt
                            found = placeholder
                        else:
                            found = _new_entry(nxt)
                            entries.append(found)
                    # Apply consensus-into-report estimates only when we
                    # actually got values from the sheet.
                    if "nextSalesEst" in info: found["salesEst"] = info["nextSalesEst"]
                    if "nextEpsEst"   in info: found["epsEst"]   = info["nextEpsEst"]

                if last:
                    c["lastReportDate"] = last
                    found = next((e for e in entries if _same_date(e.get("reportDate"), last)), None)
                    if found is None:
                        found = _new_entry(last)
                        entries.append(found)
                    for k_src, k_dst in (
                        ("salesEst", "salesEst"), ("salesActual", "salesActual"),
                        ("salesSurpNom", "salesSurpNom"), ("salesSurpPct", "salesSurpPct"),
                        ("epsEst", "epsEst"), ("epsActual", "epsActual"),
                        ("epsSurpNom", "epsSurpNom"), ("epsSurpPct", "epsSurpPct"),
                    ):
                        if k_src in info: found[k_dst] = info[k_src]

                n_e += 1
                break
    return n_p, n_v, n_e


def _same_date(a, b):
    """Tolerate format differences (e.g. '5/5/2026' vs '2026-05-05')."""
    if not a or not b: return False
    if a == b: return True
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%-m/%-d/%Y"):
        try:
            da = datetime.strptime(a, fmt)
            for fmt2 in ("%Y-%m-%d", "%m/%d/%Y", "%-m/%-d/%Y"):
                try:
                    db = datetime.strptime(b, fmt2)
                    if da.date() == db.date(): return True
                except ValueError: continue
        except ValueError: continue
    return False


def merge_perfdata(perfdata, mtd):
    if perfdata is None: perfdata = {}
    month_key = datetime.now().strftime("%Y-%m")
    n = 0
    for port, series_dict in mtd.items():
        p = perfdata.setdefault(port, {"series": [], "lastMonthEMV": None})
        for name, ret in series_dict.items():
            ser = next((s for s in (p.get("series") or [])
                        if s.get("name") == name
                        or (name in (s.get("aliases") or []))), None)
            if ser is None: continue
            ser.setdefault("returns", {})[month_key] = ret
            n += 1
    return n


def _new_uuid():
    import uuid
    return str(uuid.uuid4())


def _looks_like_error_number(v) -> bool:
    """Heuristic for previously-written Excel error codes that got
    serialized to Supabase. Legitimate finance data never falls in
    this range."""
    try:
        n = float(v)
    except (TypeError, ValueError):
        return False
    return n < -1_000_000_000 or n > 1e12


def clean_legacy_errors(companies: list[dict], fx_rates: dict) -> tuple[int, int]:
    """Strip previously-written Excel error codes (#NAME? etc. that got
    JSON-serialized as large negatives) from companies and fxRates.
    Runs before merging fresh data so any field that doesn't get a new
    good value ends up cleared rather than keeping junk."""
    n_co = 0
    for c in companies:
        for t in (c.get("tickers") or []):
            if _looks_like_error_number(t.get("price")):
                t["price"] = None; n_co += 1
            if _looks_like_error_number(t.get("perf5d")):
                t["perf5d"] = None; n_co += 1
            # Clean perf object: drop any window whose value parses as
            # a sentinel error (Excel #N/A / #VALUE!).
            perf = t.get("perf")
            if isinstance(perf, dict):
                for k in list(perf.keys()):
                    if _looks_like_error_number(perf[k]):
                        del perf[k]; n_co += 1
        val = c.get("valuation") or {}
        for k in list(val.keys()):
            if _looks_like_error_number(val[k]):
                del val[k]; n_co += 1
    n_fx = 0
    for ccy in list((fx_rates or {}).keys()):
        r = fx_rates[ccy]
        if _looks_like_error_number(r) or (isinstance(r, (int, float)) and (r <= 0 or r > 100_000)):
            del fx_rates[ccy]; n_fx += 1
    return n_co, n_fx


# ----------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------
def main() -> int:
    # Flags: --no-refresh-rep skips the LoadPositions macro (useful for
    # testing when Master List isn't running, or as a safety override).
    try_macro = "--no-refresh-rep" not in sys.argv[1:]

    log("=" * 60)
    log("Run start")
    log(f"Workbook: {WORKBOOK_PATH}")
    log(f"Master List: {MASTER_LIST_PATH}")
    log(f"Rep-holdings macro refresh: {'yes (default)' if try_macro else 'NO (--no-refresh-rep)'}")
    if not WORKBOOK_PATH.exists():
        log(f"ERROR: workbook not found"); return 1

    try:
        with ExcelSession(WORKBOOK_PATH, MASTER_LIST_PATH) as xl:
            xl.refresh_rep_holdings(try_macro=try_macro)
            # 2. FactSet — slow (~120s)
            xl.refresh_factset()
            # 3. Read everything
            log("Reading sheets...")
            prices     = read_prices(xl)
            valuations = read_valuation(xl)
            earnings   = read_earnings_dates(xl)
            fx         = read_fx(xl)
            perf_mtd   = read_performance1(xl)
            rep_hold   = read_rep_holdings(xl)
            markets    = read_markets(xl)
            metrics    = read_metrics(xl)
            tx_rows    = read_transactions(xl)
    except Exception as e:
        log(f"FATAL during Excel session: {e}\n{traceback.format_exc()}")
        return 2

    # Sanity check: if the FactSet add-in didn't load, most prices/values
    # would be None (we filter error codes), but still a few rows might
    # have legitimate cached values. Abort if we got fewer than 50 prices —
    # the workbook normally has 300+ companies, so <50 means the add-in
    # broke. Saves your Supabase data from partial corruption.
    if len(prices) < 50:
        log(f"ABORTING: only {len(prices)} prices read — FactSet add-in likely not loaded.")
        log("  Open the workbook manually in Excel to verify _xll.FDS cells calculate.")
        log("  If they do, the issue is the isolated Excel instance our script creates.")
        return 4

    log("Pushing to Supabase...")
    try:
        cos = supa_get_companies()
        existing_fx = supa_get_meta("fxRates") or {}
        n_cleaned_co, n_cleaned_fx = clean_legacy_errors(cos, existing_fx)
        if n_cleaned_co or n_cleaned_fx:
            log(f"  Cleaned legacy error values: {n_cleaned_co} company fields, {n_cleaned_fx} fx rates")
        n_p, n_v, n_e = merge_companies(cos, prices, valuations, earnings)
        n_m = merge_metrics(cos, metrics)
        n_tx, n_tx_cos, unmatched_tx = merge_transactions(cos, tx_rows)
        supa_put_companies(cos)
        log(f"  Companies: prices+={n_p}, valuations+={n_v}, earnings+={n_e}, metrics+={n_m}")
        if tx_rows:
            log(f"  Transactions: {n_tx} new across {n_tx_cos} companies"
                + (f"; {len(unmatched_tx)} unmatched names: {unmatched_tx[:10]}" if unmatched_tx else ""))

        # fxRates: merge fresh good values over the already-cleaned existing map
        existing_fx.update(fx)
        supa_put_meta("fxRates", existing_fx)
        if fx:
            supa_put_meta("fxLastUpdated",
                          datetime.now().strftime("%Y-%m-%d %H:%M") + " (FactSet auto)")

        perfdata = supa_get_meta("perfData") or {}
        n_perf = merge_perfdata(perfdata, perf_mtd)
        if n_perf:
            supa_put_meta("perfData", perfdata)
            log(f"  perfData: {n_perf} series-months")

        # Rep holdings — replace each portfolio's holdings with the fresh pull.
        # Only writing portfolios that returned any data; preserves existing
        # manually-entered data for other portfolios.
        rep_data = supa_get_meta("repData") or {}
        for port_key, positions in rep_hold.items():
            if positions:
                rep_data[port_key] = positions
        supa_put_meta("repData", rep_data)
        supa_put_meta("repLastUpdated",
                      datetime.now().strftime("%Y-%m-%d %H:%M") + " (auto)")
        log(f"  repData: {sum(len(v) for v in rep_hold.values() if v)} positions written")

        supa_put_meta("marketsSnapshot", markets)
        # Format: "<who> at <YYYY-MM-DD HH:MM>" so the UI's
        # PriceAgeIndicator can split on " at " and show "by Daily Script".
        supa_put_meta("lastPriceUpdate",
                      "Daily Script at " + datetime.now().strftime("%Y-%m-%d %H:%M"))
    except Exception as e:
        log(f"FATAL during Supabase push: {e}\n{traceback.format_exc()}")
        return 3

    log("Run complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
