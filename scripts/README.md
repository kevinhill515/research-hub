# FactSet daily pull

`factset_pull.py` reads market data from `Research Hub Upload.xlsx` (via the
FactSet Excel add-in) and pushes it to Supabase. Designed to run unattended
on a Windows machine via Task Scheduler at 7:30 AM PT, weekdays.

## What gets updated

| Source sheet | Goes into |
|---|---|
| Prices | each company's `tickers[].price` and `tickers[].perf5d` |
| Valuation | each company's `valuation.{peCurrent, peLow5, peHigh5, peAvg5, peMed5, eps1, eps2, fy1, fy2, fyMonth, currency}` |
| Earnings Dates | next-quarter date appended to each company's `earningsEntries` |
| FX | `meta.fxRates` (inverted to local-per-USD to match app convention) |
| Performance1 | `meta.perfData[portfolio].series[name].returns[YYYY-MM]` for the current month |
| Dashboard (B2:I18, B20:I33, B35:I58, K1:P16, B108:H115, B117:H132) | `meta.marketsSnapshot` (consumed by the new Markets tab) |

## One-time setup

### 1. Install Python dependencies

In a fresh PowerShell window (after Python is installed):

```powershell
pip install pywin32 requests
```

(The script itself only uses `requests` from this list — `pywin32` is needed to drive Excel.)

### 2. Verify the workbook path

The script defaults to:
```
WORKBOOK_PATH = H:\Research Hub\Research Hub Upload.xlsx
```

Edit `factset_pull.py` if your path differs.

### 3. Test it manually

```powershell
python "Y:\Research Hub\research-hub-main\scripts\factset_pull.py"
```

You should see Excel open invisibly, refresh take ~2 minutes, then push to
Supabase. Watch the log file: `H:\Research Hub\factset_pull.log`.

### 4. Schedule it

Open **Task Scheduler** (Start menu → search). Create Basic Task:

- **Name:** Research Hub FactSet Pull
- **Trigger:** Daily, start 7:30 AM, recur every 1 day
- **Days of week:** Monday-Friday (set under the trigger's "Repeat" / advanced)
- **Action:** Start a program
  - Program: `python.exe`  *(or full path to it, e.g. `C:\Users\khill\AppData\Local\Programs\Python\Python312\python.exe`)*
  - Arguments: `"Y:\Research Hub\research-hub-main\scripts\factset_pull.py"`
  - Start in: *(leave blank)*

Important Task Scheduler settings (under task properties → Conditions):
- **Wake the computer to run this task** → check (in case the machine sleeps)
- **Start the task only if the computer is on AC power** → uncheck
- **General → "Run whether user is logged on or not"** → only if you can leave a logged-in session; otherwise leave default (runs when you're logged in)

### 5. Confirm it ran

Check `H:\Research Hub\factset_pull.log` for an entry timestamped near 7:30 AM.

## Failure modes

- **Excel COM is busy** (you have it open with the workbook): the script will
  fail to open the file. Close Excel before the scheduled time.
- **FactSet not signed in**: refresh succeeds but cells return `#N/A`. The
  script silently skips `#N/A` values, so existing Supabase data isn't
  blown away — but no new data goes in either. Sign back in.
- **Workbook layout changed**: row/column ranges in the script become wrong.
  Re-edit the constants near the top of the script.

## Manual upload still works

The web app's manual paste-import flows are unchanged. You can override any
field at any time by pasting into the Data Hub, regardless of what the
scheduled job did.
