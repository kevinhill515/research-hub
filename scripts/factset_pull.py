"""
factset_pull.py — Daily FactSet → Supabase pull for Research Hub.

What it does
------------
1. Opens "Research Hub Upload.xlsx" in Excel via COM automation.
2. Triggers a full FactSet refresh (the equivalent of clicking
   FactSet > Refresh > Workbook in the ribbon).
3. Waits for refresh to complete.
4. Reads cells from Prices, Valuation, Earnings Dates, FX, Performance1,
   and the new Markets dashboard ranges.
5. Merges into the existing Supabase data (per-company tickers/valuation/
   earnings, fxRates, perfData, marketsSnapshot) and pushes back.
6. Closes Excel cleanly.

Environment
-----------
* Windows with Excel installed, FactSet add-in installed and signed in.
* Python 3.10+ with pywin32 installed:  pip install pywin32 requests
* The workbook at WORKBOOK_PATH must be openable (no other instance with
  unsaved changes).

Designed for Windows Task Scheduler at 07:30 PT, weekdays.

Logs to LOG_PATH so you can audit each run after the fact.
"""

from __future__ import annotations

import sys
import time
import json
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import urllib.request
import urllib.error

# ----------------------------------------------------------------------
# Configuration — edit paths if your setup differs.
# ----------------------------------------------------------------------
WORKBOOK_PATH = Path(r"H:\Research Hub\Research Hub Upload.xlsx")
LOG_PATH      = Path(r"H:\Research Hub\factset_pull.log")
SUPA_URL = "https://vesnqbxswmggdfevqokt.supabase.co"
SUPA_KEY = "sb_publishable_7kqbGZlL_im9kIpgFXLA-A_9CdqsyiT"

# How long to wait after triggering refresh, in seconds. FactSet can take
# a minute or two for a full workbook with hundreds of formulas.
REFRESH_WAIT_SECONDS = 120

# Last row of company data on the Prices/Valuation/Earnings sheets. The
# workbook has ~325 rows; we use 400 as a safety margin and skip blanks.
MAX_COMPANY_ROW = 400

# ----------------------------------------------------------------------
# Logging — append to a text file plus echo to stdout.
# ----------------------------------------------------------------------
def log(msg: str) -> None:
    line = f"[{datetime.now().isoformat(timespec='seconds')}] {msg}"
    print(line, flush=True)
    try:
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with LOG_PATH.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass  # logging failure shouldn't kill the run


# ----------------------------------------------------------------------
# Supabase REST helpers (stdlib only, no external HTTP dep).
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
    payload = json.loads(raw)
    return json.loads(payload["data"])


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
# Excel COM automation.
# ----------------------------------------------------------------------
class ExcelSession:
    """Context manager that opens Excel, opens the workbook, refreshes
    FactSet, and closes everything cleanly even on error."""

    def __init__(self, workbook_path: Path):
        self.path = workbook_path
        self.xl = None
        self.wb = None

    def __enter__(self):
        import win32com.client  # type: ignore
        log(f"Opening Excel...")
        self.xl = win32com.client.DispatchEx("Excel.Application")
        self.xl.Visible = False
        self.xl.DisplayAlerts = False
        log(f"Opening workbook: {self.path}")
        self.wb = self.xl.Workbooks.Open(str(self.path), UpdateLinks=False, ReadOnly=False)
        return self

    def refresh_factset(self) -> None:
        """Trigger a full FactSet workbook refresh.

        FactSet's refresh isn't a single documented COM call — different
        installs expose it under different macro names. We try the most
        common ones in order, then fall back to Excel's CalculateFullRebuild
        which forces every cell (including UDFs like _xll.FDS) to recompute
        and re-fetch from FactSet servers."""
        log("Triggering FactSet refresh...")
        attempted = []
        for macro in ("FDS.Refresh", "FdsRefreshWorkbook", "FactSet.Refresh"):
            try:
                self.xl.Run(macro)
                log(f"  Ran macro: {macro}")
                attempted.append(macro)
                break
            except Exception as e:
                log(f"  Macro {macro} not available ({e}); trying next...")
        # Always also do a full rebuild; FDSLIVE in particular needs this
        # to refetch even when the formula text is unchanged.
        try:
            self.xl.CalculateFullRebuild()
            log("  CalculateFullRebuild done")
        except Exception as e:
            log(f"  CalculateFullRebuild failed: {e}")

        log(f"Waiting {REFRESH_WAIT_SECONDS}s for FactSet to finish fetching...")
        time.sleep(REFRESH_WAIT_SECONDS)

    def sheet(self, name: str):
        return self.wb.Sheets(name)

    def cell(self, sheet_name: str, row: int, col: int):
        """Returns the calculated value of a cell (None if blank/error)."""
        v = self.wb.Sheets(sheet_name).Cells(row, col).Value
        if v is None:
            return None
        # Excel COM returns errors as pywintypes; treat all non-numeric
        # error markers as None.
        if isinstance(v, str) and v.startswith("#"):
            return None
        return v

    def __exit__(self, exc_type, exc_val, exc_tb):
        try:
            if self.wb is not None:
                self.wb.Close(SaveChanges=False)
        except Exception as e:
            log(f"Error closing workbook: {e}")
        try:
            if self.xl is not None:
                self.xl.Quit()
        except Exception as e:
            log(f"Error quitting Excel: {e}")
        # release COM objects
        self.wb = None
        self.xl = None


# ----------------------------------------------------------------------
# Read each sheet into a normalized python structure.
# ----------------------------------------------------------------------
def _num(v) -> float | None:
    """Coerce Excel value to float, or None if blank/error."""
    if v is None or v == "":
        return None
    if isinstance(v, str) and v.startswith("#"):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def read_prices(xl: ExcelSession) -> dict[str, dict]:
    """Returns { upper_ticker: {price, perf5d} } for every populated row."""
    out: dict[str, dict] = {}
    for r in range(2, MAX_COMPANY_ROW + 1):
        ord_ticker = xl.cell("Prices", r, 2)  # B
        if not ord_ticker: continue
        tk = str(ord_ticker).strip().upper()
        price = _num(xl.cell("Prices", r, 3))   # C
        perf  = _num(xl.cell("Prices", r, 4))   # D
        # FactSet returns fractional perf (e.g. 0.0234); the app stores percent.
        if perf is not None: perf = round(perf * 100, 2)
        if price is not None or perf is not None:
            out[tk] = {"price": price, "perf5d": perf}
        # ADR / US ticker if present
        us_ticker = xl.cell("Prices", r, 5)     # E
        if us_ticker:
            us_tk = str(us_ticker).strip().upper()
            us_price = _num(xl.cell("Prices", r, 6))  # F
            us_perf  = _num(xl.cell("Prices", r, 7))  # G
            if us_perf is not None: us_perf = round(us_perf * 100, 2)
            if us_price is not None or us_perf is not None:
                out[us_tk] = {"price": us_price, "perf5d": us_perf}
    log(f"  Prices: {len(out)} tickers")
    return out


def read_valuation(xl: ExcelSession) -> dict[str, dict]:
    """Returns { upper_ticker: valuation patch } for every populated row.

    Maps FactSet columns to the app's valuation field names:
      C5 Current FPE  -> peCurrent
      C6 5Y LOW       -> peLow5
      C7 5Y HIGH      -> peHigh5
      C8 5Y AVG       -> peAvg5
      C9 5Y MED       -> peMed5
      C10 FY Month    -> fyMonth (Excel date serial -> 'Mmm')
      C11 Curr        -> currency
      C12 FY1 date    -> fy1     (Excel date serial -> 'FYxxxxE')
      C13 EPS1        -> eps1
      C14 W1%         -> w1
      C15 FY2 date    -> fy2
      C16 EPS2        -> eps2
      C17 W2%         -> w2
    """
    out: dict[str, dict] = {}
    for r in range(2, MAX_COMPANY_ROW + 1):
        tk = xl.cell("Valuation", r, 1)  # A
        if not tk: continue
        tk = str(tk).strip().upper()
        patch: dict = {}
        def s(v): return None if v is None else str(round(float(v), 4)) if isinstance(v, (int, float)) else str(v).strip()
        pe_cur = _num(xl.cell("Valuation", r, 5));  patch["peCurrent"] = s(pe_cur) if pe_cur else None
        pe_lo  = _num(xl.cell("Valuation", r, 6));  patch["peLow5"]   = s(pe_lo)  if pe_lo  else None
        pe_hi  = _num(xl.cell("Valuation", r, 7));  patch["peHigh5"]  = s(pe_hi)  if pe_hi  else None
        pe_avg = _num(xl.cell("Valuation", r, 8));  patch["peAvg5"]   = s(pe_avg) if pe_avg else None
        pe_med = _num(xl.cell("Valuation", r, 9));  patch["peMed5"]   = s(pe_med) if pe_med else None
        fy_month_raw = xl.cell("Valuation", r, 10)
        patch["fyMonth"] = _excel_date_to_month_name(fy_month_raw)
        ccy = xl.cell("Valuation", r, 11)
        if ccy: patch["currency"] = str(ccy).strip().upper()
        fy1_raw = xl.cell("Valuation", r, 12)
        patch["fy1"] = _excel_date_to_fy_label(fy1_raw)
        eps1 = _num(xl.cell("Valuation", r, 13))
        patch["eps1"] = s(eps1) if eps1 is not None else None
        w1 = _num(xl.cell("Valuation", r, 14))
        if w1 is not None: patch["w1"] = s(w1)
        fy2_raw = xl.cell("Valuation", r, 15)
        patch["fy2"] = _excel_date_to_fy_label(fy2_raw)
        eps2 = _num(xl.cell("Valuation", r, 16))
        patch["eps2"] = s(eps2) if eps2 is not None else None
        w2 = _num(xl.cell("Valuation", r, 17))
        if w2 is not None: patch["w2"] = s(w2)
        # Strip Nones so we don't blank existing fields when FactSet returns nothing.
        patch = {k: v for k, v in patch.items() if v is not None}
        if patch:
            out[tk] = patch
    log(f"  Valuation: {len(out)} tickers")
    return out


def _excel_date_to_month_name(v) -> str | None:
    """Excel date serial / pywin32 date -> 'Jan'..'Dec'."""
    if v is None or v == "": return None
    try:
        if hasattr(v, "month"):  # pywintypes.datetime
            month = v.month
        elif isinstance(v, (int, float)):
            d = _excel_serial_to_date(v)
            month = d.month
        else:
            return None
        names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
        return names[month - 1]
    except Exception:
        return None


def _excel_date_to_fy_label(v) -> str | None:
    """Excel date / pywin32 date -> 'FY2026E' style label using calendar year."""
    if v is None or v == "": return None
    try:
        if hasattr(v, "year"):
            yr = v.year
        elif isinstance(v, (int, float)):
            yr = _excel_serial_to_date(v).year
        else:
            return None
        return f"FY{yr}E"
    except Exception:
        return None


def _excel_serial_to_date(serial: float):
    """Excel serial day -> python date (account for the 1900 leap year bug)."""
    from datetime import datetime, timedelta
    base = datetime(1899, 12, 30)
    return base + timedelta(days=int(serial))


def read_earnings_dates(xl: ExcelSession) -> dict[str, str]:
    """Returns { upper_ticker: 'YYYY-MM-DD' }."""
    out: dict[str, str] = {}
    for r in range(2, MAX_COMPANY_ROW + 1):
        tk = xl.cell("Earnings Dates", r, 4)  # D
        if not tk: continue
        tk = str(tk).strip().upper()
        date_raw = xl.cell("Earnings Dates", r, 5)  # E
        # FactSet returns YYYYMMDD as a number, like 20260505
        if isinstance(date_raw, (int, float)) and date_raw > 19000000:
            n = int(date_raw)
            y = n // 10000; m = (n // 100) % 100; d = n % 100
            try:
                out[tk] = f"{y:04d}-{m:02d}-{d:02d}"
            except Exception:
                pass
    log(f"  Earnings dates: {len(out)} tickers")
    return out


def read_fx(xl: ExcelSession) -> dict[str, float]:
    """Returns { 'JPY': rate_local_per_USD, ... }.

    The FX sheet has rows like 'JPYUSD' in col A and the rate in col B.
    The app stores fxRates as local-per-USD; FactSet's P_EXCH_RATE(local,USD)
    returns USD-per-local, so we INVERT (1 / rate) to match the app's
    convention. (e.g. EURUSD = 1.0856 USD/EUR -> stored as 0.9211 EUR/USD)"""
    out: dict[str, float] = {}
    # FX sheet has up to ~24 rows; scan generously.
    for r in range(2, 60):
        pair = xl.cell("FX", r, 1)
        rate = _num(xl.cell("FX", r, 2))
        if not pair or rate is None or rate == 0: continue
        pair = str(pair).strip().upper()
        # Pair format is typically 'AUDUSD' meaning USD per AUD.
        if pair.endswith("USD") and len(pair) == 6:
            ccy = pair[:3]
            # Invert so JPY -> 152 (local per USD)
            out[ccy] = round(1.0 / rate, 6) if rate else None
    log(f"  FX: {len(out)} currencies")
    return out


def read_performance1(xl: ExcelSession) -> dict[str, dict[str, float]]:
    """Returns {portfolio: {series_name: mtd_return_decimal}}.

    The Performance1 sheet has 4 portfolio groups in a horizontal layout:
      cols  2-9   GL  group: GL, FGL, ACWI, ACWI Value, S&P 500, APHGX, WCMGX, GQRIX
      cols 11-20  IN  group: IN, FIN, ACWI ex US, ACWI ex US Value, S&P 500, APHKX, WCMIX, WCMOX, GSIMX
      cols 22-30  EM  group: EM, MSCI EM, MSCI EM Value, ACWI, ACWI ex US, S&P 500, GQGIX, GEME
      cols 32-39  SC  group: SC, ACWI ex US SC, ACWI ex US SC Value, ACWI, ACWI ex US, S&P 500, BISAX

    We DON'T pull cells for the user's own portfolio columns (GL/FGL/IN/FIN/EM/SC)
    since those are the values they track manually. We only pull the benchmark/
    competitor cells which contain FactSet formulas. Caller decides which
    portfolio "owns" which series (matches by name into existing perfData)."""
    out: dict[str, dict[str, float]] = {"GL": {}, "FGL": {}, "IN": {}, "FIN": {}, "EM": {}, "SC": {}}

    def _grab(group_name: str, header_col: int, value_col: int):
        name = xl.cell("Performance1", 1, header_col)
        ret  = _num(xl.cell("Performance1", 2, value_col))
        if name and ret is not None:
            for p in {"GL":["GL","FGL"], "IN":["IN","FIN"], "EM":["EM"], "SC":["SC"]}[group_name]:
                out[p][str(name).strip()] = ret

    # GL group: benchmark cols D,E,F (4,5,6) and competitor cols G,H,I (7,8,9)
    for col in (4, 5, 6, 7, 8, 9):
        _grab("GL", col, col)
    # IN group: cols N..T (14..20)
    for col in range(14, 21):
        _grab("IN", col, col)
    # EM group: cols X..AD (24..30)
    for col in range(24, 31):
        _grab("EM", col, col)
    # SC group: cols AH..AM (34..39)
    for col in range(34, 40):
        _grab("SC", col, col)

    total = sum(len(v) for v in out.values())
    log(f"  Performance1: {total} series x months")
    return out


# Markets dashboard ranges — just label, ticker, and the 7 timeframe values.
MARKETS_RANGES = [
    {"key": "indices",    "row_from": 2,   "row_to": 18,  "label_col": 2, "ticker_col": 1},
    {"key": "sectors",    "row_from": 21,  "row_to": 33,  "label_col": 2, "ticker_col": 1},
    {"key": "countries",  "row_from": 36,  "row_to": 58,  "label_col": 2, "ticker_col": 1},
    {"key": "commodities","row_from": 109, "row_to": 115, "label_col": 2, "ticker_col": 1},
    {"key": "bonds",      "row_from": 118, "row_to": 132, "label_col": 2, "ticker_col": 1},
]
MARKETS_PERIOD_COLS = [("1D",3),("5D",4),("MTD",5),("QTD",6),("YTD",7),("1Y",8),("3Y",9)]


def read_markets(xl: ExcelSession) -> dict:
    """Returns the Markets dashboard snapshot:
      { 'asOf': iso, 'indices': [...], 'sectors': [...], ... }"""
    snap = {"asOf": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    for grp in MARKETS_RANGES:
        rows = []
        for r in range(grp["row_from"], grp["row_to"] + 1):
            label = xl.cell("Dashboard", r, grp["label_col"])
            if not label: continue
            ticker = xl.cell("Dashboard", r, grp["ticker_col"])
            row = {"label": str(label), "ticker": str(ticker) if ticker else None}
            for period, c in MARKETS_PERIOD_COLS:
                v = _num(xl.cell("Dashboard", r, c))
                # FactSet returns decimal (e.g. 0.012 = 1.2%). Store decimal;
                # UI formats as percent.
                row[period] = v
            rows.append(row)
        snap[grp["key"]] = rows
        log(f"  Markets/{grp['key']}: {len(rows)} rows")

    # FX 3M and 12M tables (K1:P16 area)
    fx_3m, fx_12m = [], []
    for r in range(4, 9):
        ccy = xl.cell("Dashboard", r, 12)  # L
        v   = _num(xl.cell("Dashboard", r, 13))  # M
        if ccy and v is not None: fx_3m.append({"label": str(ccy), "value": v})
    for r in range(12, 17):
        ccy = xl.cell("Dashboard", r, 12)
        v   = _num(xl.cell("Dashboard", r, 13))
        if ccy and v is not None: fx_12m.append({"label": str(ccy), "value": v})
    snap["fx3M"] = fx_3m
    snap["fx12M"] = fx_12m
    log(f"  Markets/fx: {len(fx_3m)} (3M) + {len(fx_12m)} (12M)")

    return snap


# ----------------------------------------------------------------------
# Merge into existing companies / meta and push.
# ----------------------------------------------------------------------
def merge_companies(companies: list[dict],
                    prices: dict, valuations: dict, earnings: dict) -> tuple[int, int, int]:
    """Apply price/valuation/earnings updates to the in-memory companies list.

    Matches each company by every ticker in its `tickers[]` list. If a
    company has no tickers but a legacy `ticker` field, falls back to that.

    Returns (n_companies_updated_prices, n_valuations_updated, n_earnings_updated).
    """
    n_p = n_v = n_e = 0
    today_str = datetime.now().strftime("%Y-%m-%d")
    for c in companies:
        all_tks = []
        for t in (c.get("tickers") or []):
            tk = (t.get("ticker") or "").upper()
            if tk: all_tks.append(tk)
        if not all_tks and c.get("ticker"):
            all_tks.append(c["ticker"].upper())

        # --- Prices: update each ticker on the company that has FactSet data
        any_price_update = False
        for t in (c.get("tickers") or []):
            tk = (t.get("ticker") or "").upper()
            if tk in prices:
                p = prices[tk]
                if p["price"] is not None: t["price"] = p["price"]
                if p["perf5d"] is not None: t["perf5d"] = str(p["perf5d"])
                any_price_update = True
        if any_price_update: n_p += 1

        # --- Valuation: take the FIRST ticker that has data
        for tk in all_tks:
            if tk in valuations:
                v = c.setdefault("valuation", {})
                v.update(valuations[tk])
                # Also mirror price into valuation.price for legacy code
                ord_ticker = next((t for t in (c.get("tickers") or []) if t.get("isOrdinary")), None)
                if ord_ticker and ord_ticker.get("price") is not None:
                    v["price"] = ord_ticker["price"]
                n_v += 1
                break

        # --- Earnings dates: ensure earningsEntries has an entry matching the next quarter
        for tk in all_tks:
            if tk in earnings:
                d = earnings[tk]
                entries = c.setdefault("earningsEntries", [])
                # Find an existing future-dated empty entry, or create a new one
                found = next((e for e in entries if e.get("reportDate") == d), None)
                if found is None:
                    # Look for a placeholder entry we may have created previously
                    placeholder = next((e for e in entries if not e.get("eps") and not e.get("shortTakeaway")
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


def merge_perfdata(perfdata: dict, mtd: dict[str, dict[str, float]]) -> int:
    """Update each portfolio's series with the new MTD return for current month."""
    if perfdata is None: perfdata = {}
    month_key = datetime.now().strftime("%Y-%m")
    n_updated = 0
    for portfolio, series_dict in mtd.items():
        port = perfdata.setdefault(portfolio, {"series": [], "lastMonthEMV": None})
        for series_name, ret in series_dict.items():
            ser = next((s for s in (port.get("series") or [])
                        if s.get("name") == series_name
                        or (series_name in (s.get("aliases") or []))), None)
            if ser is None:
                continue  # don't auto-create unknown series; user adds them via UI
            ser.setdefault("returns", {})[month_key] = ret
            n_updated += 1
    return n_updated


def _new_uuid() -> str:
    import uuid
    return str(uuid.uuid4())


# ----------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------
def main() -> int:
    log("=" * 60)
    log("Run start")
    log(f"Workbook: {WORKBOOK_PATH}")
    if not WORKBOOK_PATH.exists():
        log(f"ERROR: workbook not found at {WORKBOOK_PATH}")
        return 1

    try:
        with ExcelSession(WORKBOOK_PATH) as xl:
            xl.refresh_factset()
            log("Reading sheets...")
            prices     = read_prices(xl)
            valuations = read_valuation(xl)
            earnings   = read_earnings_dates(xl)
            fx         = read_fx(xl)
            perf_mtd   = read_performance1(xl)
            markets    = read_markets(xl)
    except Exception as e:
        log(f"FATAL during Excel session: {e}\n{traceback.format_exc()}")
        return 2

    log("Pushing to Supabase...")
    try:
        # Companies
        cos = supa_get_companies()
        n_p, n_v, n_e = merge_companies(cos, prices, valuations, earnings)
        supa_put_companies(cos)
        log(f"  Companies: prices+={n_p}, valuations+={n_v}, earnings+={n_e}")

        # FX
        if fx:
            existing_fx = supa_get_meta("fxRates") or {}
            existing_fx.update(fx)
            supa_put_meta("fxRates", existing_fx)
            log(f"  fxRates: {len(fx)} updated")
            supa_put_meta("fxLastUpdated",
                          datetime.now().strftime("%Y-%m-%d %H:%M") + " (FactSet auto)")

        # Performance MTD
        perfdata = supa_get_meta("perfData") or {}
        n_perf = merge_perfdata(perfdata, perf_mtd)
        if n_perf:
            supa_put_meta("perfData", perfdata)
            log(f"  perfData: {n_perf} series-months updated")

        # Markets snapshot
        supa_put_meta("marketsSnapshot", markets)
        log(f"  marketsSnapshot: {sum(len(markets.get(k, [])) for k in ['indices','sectors','countries','commodities','bonds'])} rows")

        # Last-update marker for the price column (used by app's price-age indicator)
        supa_put_meta("lastPriceUpdate",
                      datetime.now().strftime("%Y-%m-%d %H:%M") + " (FactSet auto)")
    except Exception as e:
        log(f"FATAL during Supabase push: {e}\n{traceback.format_exc()}")
        return 3

    log("Run complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
