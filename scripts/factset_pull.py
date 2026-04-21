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
import traceback
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ----------------------------------------------------------------------
# Configuration — edit these four paths for your setup.
# ----------------------------------------------------------------------
WORKBOOK_PATH    = Path(r"H:\Research Hub\Research Hub Upload.xlsx")
MASTER_LIST_PATH = Path(r"Y:\Research Hub\Master List COPY.xlsm")  # change to real path for production
LOG_PATH         = Path(r"H:\Research Hub\factset_pull.log")

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
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


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

    def __enter__(self):
        import win32com.client
        log("Attaching to running Excel instance...")
        try:
            self.xl = win32com.client.GetActiveObject("Excel.Application")
        except Exception:
            log("  No running Excel found — falling back to DispatchEx (new instance)")
            log("  NOTE: rep-holdings macro will likely fail without an existing session.")
            self.xl = win32com.client.DispatchEx("Excel.Application")
            self.xl.Visible = False

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
        # if its full path differs from our config. Only fall back to
        # opening our configured copy if none is already open.
        self.master_wb = self._find_open_by_name(["master list"])
        if self.master_wb is not None:
            log(f"  Master List: found open — {self.master_wb.Name}  ({self.master_wb.FullName})")
        else:
            self.master_wb = self._find_or_open(self.master_path, "master")
            if self.master_wb is not None:
                log(f"  Master List: opened COPY — {self.master_wb.Name}  (macros may fail; real one isn't open)")
            else:
                log(f"  Master List unavailable — rep-holdings refresh will be skipped")

        # Find or open the main workbook
        self.wb = self._find_or_open(self.main_path, "main")
        if self.wb is None:
            raise RuntimeError(f"Could not open main workbook at {self.main_path}")
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

        log("Running OpenConnection macro...")
        opened = run_macro("OpenConnection")
        if opened:
            time.sleep(5)
            log("  OpenConnection done")
        else:
            log("  OpenConnection couldn't be run — trying LoadPositions anyway (connection may already be open)")

        log("Running LoadPositions macro...")
        if not run_macro("LoadPositions"):
            log("  LoadPositions failed — continuing with cached Rep Holdings data")
            return
        log(f"Waiting {REP_WAIT_SECONDS}s for positions to populate...")
        time.sleep(REP_WAIT_SECONDS)

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
                # hresult -2147418111 = RPC_E_CALL_REJECTED ("Call was rejected by callee")
                # hresult -2147417846 = RPC_E_SERVERCALL_RETRYLATER
                if e.hresult in (-2147418111, -2147417846):
                    time.sleep(0.5 * (2 ** attempt))
                    last_err = e
                    continue
                raise
        log(f"  cell({sheet_name} R{row}C{col}) failed after retries: {last_err}")
        return None

    def __exit__(self, exc_type, exc_val, exc_tb):
        # Close only the workbooks we opened ourselves. Leave the user's
        # session + their open workbooks (Master List + anything else) alone.
        if self._we_opened_main and self.wb is not None:
            try: self.wb.Close(SaveChanges=False)
            except Exception as e: log(f"Close main: {e}")
        if self._we_opened_master and self.master_wb is not None:
            try: self.master_wb.Close(SaveChanges=False)
            except Exception as e: log(f"Close master: {e}")
        # Restore the user's calculation setting
        if self._saved_calc is not None:
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


def read_prices(xl: ExcelSession) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for r in range(2, MAX_COMPANY_ROW + 1):
        ord_ticker = xl.cell("Prices", r, 2)
        if not ord_ticker: continue
        tk = str(ord_ticker).strip().upper()
        price = _num(xl.cell("Prices", r, 3))
        perf  = _num(xl.cell("Prices", r, 4))
        if perf is not None: perf = round(perf * 100, 2)
        if price is not None or perf is not None:
            out[tk] = {"price": price, "perf5d": perf}
        us_ticker = xl.cell("Prices", r, 5)
        if us_ticker:
            us_tk = str(us_ticker).strip().upper()
            us_price = _num(xl.cell("Prices", r, 6))
            us_perf  = _num(xl.cell("Prices", r, 7))
            if us_perf is not None: us_perf = round(us_perf * 100, 2)
            if us_price is not None or us_perf is not None:
                out[us_tk] = {"price": us_price, "perf5d": us_perf}
    log(f"  Prices: {len(out)} tickers")
    return out


def read_valuation(xl: ExcelSession) -> dict[str, dict]:
    out: dict[str, dict] = {}
    def s(v):
        if v is None: return None
        if isinstance(v, (int, float)): return str(round(float(v), 4))
        return str(v).strip()
    for r in range(2, MAX_COMPANY_ROW + 1):
        tk = xl.cell("Valuation", r, 1)
        if not tk: continue
        tk = str(tk).strip().upper()
        patch: dict = {}
        for label, col, stringify in (
            ("peCurrent", 5, True), ("peLow5", 6, True), ("peHigh5", 7, True),
            ("peAvg5", 8, True),    ("peMed5", 9, True),
        ):
            v = _num(xl.cell("Valuation", r, col))
            if v is not None: patch[label] = s(v)
        fy_month = _excel_date_to_month_name(xl.cell("Valuation", r, 10))
        if fy_month: patch["fyMonth"] = fy_month
        ccy = xl.cell("Valuation", r, 11)
        if ccy: patch["currency"] = str(ccy).strip().upper()
        fy1 = _excel_date_to_fy_label(xl.cell("Valuation", r, 12))
        if fy1: patch["fy1"] = fy1
        eps1 = _num(xl.cell("Valuation", r, 13))
        if eps1 is not None: patch["eps1"] = s(eps1)
        w1 = _num(xl.cell("Valuation", r, 14))
        if w1 is not None: patch["w1"] = s(w1)
        fy2 = _excel_date_to_fy_label(xl.cell("Valuation", r, 15))
        if fy2: patch["fy2"] = fy2
        eps2 = _num(xl.cell("Valuation", r, 16))
        if eps2 is not None: patch["eps2"] = s(eps2)
        w2 = _num(xl.cell("Valuation", r, 17))
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


def read_earnings_dates(xl: ExcelSession) -> dict[str, str]:
    """Returns { upper_ticker: 'YYYY-MM-DD' }. FactSet's JULIAN() return
    lands in Excel as a formatted date, which pywin32 gives us as a
    pywintypes.datetime (has .year/.month/.day). Older workbooks might
    serve it as a YYYYMMDD int or an Excel serial day number — handle all."""
    out: dict[str, str] = {}
    for r in range(2, MAX_COMPANY_ROW + 1):
        tk = xl.cell("Earnings Dates", r, 4)
        if not tk: continue
        tk = str(tk).strip().upper()
        raw = xl.cell("Earnings Dates", r, 5)
        iso = _any_date_to_iso(raw)
        if iso: out[tk] = iso
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
    out: dict[str, float] = {}
    for r in range(2, 60):
        pair = xl.cell("FX", r, 1)
        rate = _num(xl.cell("FX", r, 2))
        if not pair or rate is None or rate == 0: continue
        pair = str(pair).strip().upper()
        if pair.endswith("USD") and len(pair) == 6:
            ccy = pair[:3]
            out[ccy] = round(1.0 / rate, 6) if rate else None
    log(f"  FX: {len(out)} currencies")
    return out


def read_performance1(xl: ExcelSession) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {"GL": {}, "FGL": {}, "IN": {}, "FIN": {}, "EM": {}, "SC": {}}
    def grab(group, col):
        name = xl.cell("Performance1", 1, col)
        ret = _num(xl.cell("Performance1", 2, col))
        if name and ret is not None:
            for p in {"GL":["GL","FGL"], "IN":["IN","FIN"], "EM":["EM"], "SC":["SC"]}[group]:
                out[p][str(name).strip()] = ret
    for c in (4,5,6,7,8,9): grab("GL", c)
    for c in range(14,21):  grab("IN", c)
    for c in range(24,31):  grab("EM", c)
    for c in range(34,40):  grab("SC", c)
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

    for r in range(4, MAX_REP_HOLDINGS_ROW + 1):
        port_code = xl.cell("Rep Holdings", r, 11)  # K
        if not port_code: continue
        port_key = rep_accounts.get(str(port_code).strip().upper())
        if not port_key: continue
        ticker = xl.cell("Rep Holdings", r, 12)     # L
        shares = _num(xl.cell("Rep Holdings", r, 13))  # M
        avg    = _num(xl.cell("Rep Holdings", r, 14))  # N
        if not ticker or shares is None: continue
        tk = str(ticker).strip().upper()
        if not tk: continue
        out[port_key][tk] = {"shares": shares, "avgCost": avg if avg is not None else 0}

    total = sum(len(v) for v in out.values())
    log(f"  Rep Holdings: {total} positions across {sum(1 for v in out.values() if v)} portfolios")
    return out


# Metrics tab: 25 FactSet columns keyed by ord ticker. Columns A=Company,
# B=Ord Ticker, C-Y = metrics, Z-AE = 6 performance periods.
METRICS_COLS = [
    # (key, excel_col, percent_flag)
    # percent_flag: True means the raw value is a decimal that represents
    # a percent — we multiply by 100 for display. False means it's already
    # a ratio / count / multiple and should be shown as-is.
    ("mktCap",  3,  False),  # C — $B already (formula divides by 1000)
    ("fpe1",    4,  False),  # D
    ("fpe2",    5,  False),  # E
    ("fcfYld1", 6,  True),   # F — /100 in formula already — leave as decimal
    ("fcfYld2", 7,  True),   # G
    ("divYld1", 8,  True),   # H
    ("divYld2", 9,  True),   # I
    ("payout1", 10, False),  # J = H/F
    ("payout2", 11, False),  # K = I/G
    ("netDE1",  12, False),  # L
    ("netDE2",  13, False),  # M
    ("intCov",  14, False),  # N
    ("ltEPS",   15, True),   # O — already /100
    ("grMgn1",  16, True),   # P
    ("grMgn2",  17, True),   # Q
    ("netMgn1", 18, True),   # R
    ("netMgn2", 19, True),   # S
    ("gpAss1",  20, False),  # T — ratio
    ("gpAss2",  21, False),  # U
    ("npAss1",  22, False),  # V
    ("npAss2",  23, False),  # W
    ("opROE1",  24, False),  # X
    ("opROE2",  25, False),  # Y
]
METRICS_PERF_COLS = [
    # (period_key, col)
    ("MTD", 26), ("QTD", 27), ("3M", 28), ("6M", 29), ("YTD", 30), ("1Y", 31),
]


def read_metrics(xl: ExcelSession) -> dict[str, dict]:
    """Returns { upper_ticker: {metric_key: value, ..., perf: {period: value}} }"""
    out: dict[str, dict] = {}
    for r in range(2, MAX_COMPANY_ROW + 1):
        tk = xl.cell("Metrics", r, 2)  # B = ord ticker
        if not tk: continue
        tk = str(tk).strip().upper()
        m: dict = {}
        for key, col, _pct in METRICS_COLS:
            v = _num(xl.cell("Metrics", r, col))
            if v is not None:
                m[key] = v
        perf: dict = {}
        for period, col in METRICS_PERF_COLS:
            v = _num(xl.cell("Metrics", r, col))
            if v is not None:
                perf[period] = v
        if perf: m["perf"] = perf
        if m: out[tk] = m
    log(f"  Metrics: {len(out)} tickers")
    return out


# Markets dashboard ranges
MARKETS_RANGES = [
    {"key": "indices",    "row_from": 2,   "row_to": 18,  "label_col": 2, "ticker_col": 1},
    {"key": "sectors",    "row_from": 21,  "row_to": 33,  "label_col": 2, "ticker_col": 1},
    {"key": "countries",  "row_from": 36,  "row_to": 58,  "label_col": 2, "ticker_col": 1},
    {"key": "commodities","row_from": 109, "row_to": 115, "label_col": 2, "ticker_col": 1},
    {"key": "bonds",      "row_from": 118, "row_to": 132, "label_col": 2, "ticker_col": 1},
]
MARKETS_PERIOD_COLS = [("1D",3),("5D",4),("MTD",5),("QTD",6),("YTD",7),("1Y",8),("3Y",9)]


def read_markets(xl: ExcelSession) -> dict:
    snap = {"asOf": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    for grp in MARKETS_RANGES:
        rows = []
        for r in range(grp["row_from"], grp["row_to"] + 1):
            label = xl.cell("Dashboard", r, grp["label_col"])
            if not label: continue
            ticker = xl.cell("Dashboard", r, grp["ticker_col"])
            row = {"label": str(label), "ticker": str(ticker) if ticker else None}
            for period, c in MARKETS_PERIOD_COLS:
                row[period] = _num(xl.cell("Dashboard", r, c))
            rows.append(row)
        snap[grp["key"]] = rows
        log(f"  Markets/{grp['key']}: {len(rows)} rows")

    # FX table sits in cols K (label) & L (value), not L/M.
    fx_3m, fx_12m = [], []
    for r in range(4, 9):
        ccy = xl.cell("Dashboard", r, 11); v = _num(xl.cell("Dashboard", r, 12))
        if ccy and v is not None: fx_3m.append({"label": str(ccy), "value": v})
    for r in range(12, 17):
        ccy = xl.cell("Dashboard", r, 11); v = _num(xl.cell("Dashboard", r, 12))
        if ccy and v is not None: fx_12m.append({"label": str(ccy), "value": v})
    snap["fx3M"] = fx_3m
    snap["fx12M"] = fx_12m
    log(f"  Markets/fx: {len(fx_3m)} (3M) + {len(fx_12m)} (12M)")
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

        # Prices
        any_p = False
        for t in (c.get("tickers") or []):
            tk = (t.get("ticker") or "").upper()
            if tk in prices:
                p = prices[tk]
                if p["price"] is not None: t["price"] = p["price"]
                if p["perf5d"] is not None: t["perf5d"] = str(p["perf5d"])
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

        # Earnings date (add/update an entry for that date)
        for tk in all_tks:
            if tk in earnings:
                d = earnings[tk]
                entries = c.setdefault("earningsEntries", [])
                found = next((e for e in entries if _same_date(e.get("reportDate"), d)), None)
                if found is None:
                    placeholder = next((e for e in entries
                                        if not e.get("eps") and not e.get("shortTakeaway")
                                        and not e.get("reportDate")), None)
                    if placeholder:
                        placeholder["reportDate"] = d
                    else:
                        entries.append({
                            "id": _new_uuid(),
                            "quarter": "", "reportDate": d, "eps": "",
                            "tpChange": "Unchanged", "newTP": "", "tpRationale": "",
                            "bullets": ["", "", "", "", ""], "shortTakeaway": "",
                            "extendedTakeaway": "", "thesisStatus": "On track",
                            "thesisNote": "", "open": False,
                        })
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
        supa_put_companies(cos)
        log(f"  Companies: prices+={n_p}, valuations+={n_v}, earnings+={n_e}, metrics+={n_m}")

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
        supa_put_meta("lastPriceUpdate",
                      datetime.now().strftime("%Y-%m-%d %H:%M") + " (FactSet auto)")
    except Exception as e:
        log(f"FATAL during Supabase push: {e}\n{traceback.format_exc()}")
        return 3

    log("Run complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
