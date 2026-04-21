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


class ExcelSession:
    """Open Excel in manual-calc mode, open Master List + main workbook,
    trigger refreshes explicitly, then close everything cleanly."""

    def __init__(self, main_path: Path, master_path: Path):
        self.main_path = main_path
        self.master_path = master_path
        self.xl = None
        self.master_wb = None
        self.wb = None
        self._scratch_wb = None

    def __enter__(self):
        import win32com.client
        log(f"Opening Excel (manual calc mode)...")
        self.xl = win32com.client.DispatchEx("Excel.Application")
        self.xl.Visible = False
        self.xl.DisplayAlerts = False
        # Excel refuses to set Application.Calculation until at least one
        # workbook exists. Add a blank throwaway workbook first, THEN set
        # manual calc, THEN open the real files so _xll.FDSLIVE cells
        # don't auto-fire on open.
        self._scratch_wb = self.xl.Workbooks.Add()
        self.xl.Calculation = CALC_MANUAL
        self.xl.ScreenUpdating = False

        if self.master_path.exists():
            log(f"Opening Master List: {self.master_path}")
            self.master_wb = self.xl.Workbooks.Open(str(self.master_path),
                                                    UpdateLinks=False, ReadOnly=True)
        else:
            log(f"WARNING: Master List not found at {self.master_path} — rep holdings refresh will fail")

        log(f"Opening workbook: {self.main_path}")
        self.wb = self.xl.Workbooks.Open(str(self.main_path),
                                          UpdateLinks=False, ReadOnly=False)
        return self

    # -- Refresh: rep holdings --
    def refresh_rep_holdings(self) -> None:
        if self.master_wb is None:
            log("  (skipping rep holdings — Master List not open)")
            return
        log("Running LoadPositions macro...")
        try:
            self.xl.Run("'Master List COPY.xlsm'!LoadPositions")
        except Exception:
            # try the original filename as a fallback — user may point this
            # at the real file whose name is 'Master List.xlsm'
            try:
                self.xl.Run("'Master List.xlsm'!LoadPositions")
            except Exception as e:
                log(f"  LoadPositions macro failed: {e}")
                return
        log(f"Waiting {REP_WAIT_SECONDS}s for rep holdings to populate...")
        time.sleep(REP_WAIT_SECONDS)
        # Recalc the Rep Holdings sheet so cols K-N parsing formulas update
        try:
            self.wb.Sheets("Rep Holdings").Calculate()
            log("  Rep Holdings recalc done")
        except Exception as e:
            log(f"  Rep Holdings recalc failed: {e}")

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
        v = self.wb.Sheets(sheet_name).Cells(row, col).Value
        if v is None: return None
        if isinstance(v, str) and v.startswith("#"): return None
        return v

    def __exit__(self, exc_type, exc_val, exc_tb):
        try:
            if self.wb is not None: self.wb.Close(SaveChanges=False)
        except Exception as e: log(f"Close main: {e}")
        try:
            if self.master_wb is not None: self.master_wb.Close(SaveChanges=False)
        except Exception as e: log(f"Close master: {e}")
        try:
            if self._scratch_wb is not None: self._scratch_wb.Close(SaveChanges=False)
        except Exception as e: log(f"Close scratch: {e}")
        try:
            if self.xl is not None:
                # restore auto-calc before quitting (doesn't really matter but clean)
                try: self.xl.Calculation = CALC_AUTOMATIC
                except Exception: pass
                self.xl.Quit()
        except Exception as e: log(f"Quit: {e}")
        self.wb = self.master_wb = self._scratch_wb = self.xl = None


# ----------------------------------------------------------------------
# Sheet readers (unchanged from first version except rep holdings)
# ----------------------------------------------------------------------
def _num(v) -> float | None:
    if v is None or v == "": return None
    if isinstance(v, str) and v.startswith("#"): return None
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
    out: dict[str, str] = {}
    for r in range(2, MAX_COMPANY_ROW + 1):
        tk = xl.cell("Earnings Dates", r, 4)
        if not tk: continue
        tk = str(tk).strip().upper()
        raw = xl.cell("Earnings Dates", r, 5)
        if isinstance(raw, (int, float)) and raw > 19000000:
            n = int(raw)
            y, m, d = n // 10000, (n // 100) % 100, n % 100
            try: out[tk] = f"{y:04d}-{m:02d}-{d:02d}"
            except Exception: pass
    log(f"  Earnings dates: {len(out)} tickers")
    return out


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

    fx_3m, fx_12m = [], []
    for r in range(4, 9):
        ccy = xl.cell("Dashboard", r, 12); v = _num(xl.cell("Dashboard", r, 13))
        if ccy and v is not None: fx_3m.append({"label": str(ccy), "value": v})
    for r in range(12, 17):
        ccy = xl.cell("Dashboard", r, 12); v = _num(xl.cell("Dashboard", r, 13))
        if ccy and v is not None: fx_12m.append({"label": str(ccy), "value": v})
    snap["fx3M"] = fx_3m
    snap["fx12M"] = fx_12m
    log(f"  Markets/fx: {len(fx_3m)} (3M) + {len(fx_12m)} (12M)")
    return snap


# ----------------------------------------------------------------------
# Merge helpers
# ----------------------------------------------------------------------
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


# ----------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------
def main() -> int:
    log("=" * 60)
    log("Run start")
    log(f"Workbook: {WORKBOOK_PATH}")
    log(f"Master List: {MASTER_LIST_PATH}")
    if not WORKBOOK_PATH.exists():
        log(f"ERROR: workbook not found"); return 1

    try:
        with ExcelSession(WORKBOOK_PATH, MASTER_LIST_PATH) as xl:
            # 1. Rep holdings — fast (~25s)
            xl.refresh_rep_holdings()
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
    except Exception as e:
        log(f"FATAL during Excel session: {e}\n{traceback.format_exc()}")
        return 2

    log("Pushing to Supabase...")
    try:
        cos = supa_get_companies()
        n_p, n_v, n_e = merge_companies(cos, prices, valuations, earnings)
        supa_put_companies(cos)
        log(f"  Companies: prices+={n_p}, valuations+={n_v}, earnings+={n_e}")

        if fx:
            existing = supa_get_meta("fxRates") or {}
            existing.update(fx)
            supa_put_meta("fxRates", existing)
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
