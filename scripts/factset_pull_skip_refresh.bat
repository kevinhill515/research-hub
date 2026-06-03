@echo off
REM ---------------------------------------------------------------
REM factset_pull_skip_refresh.bat
REM
REM Runs the daily FactSet pull WITHOUT triggering the in-script
REM "Refresh Workbook" wait. Use this when the Research Hub Upload
REM workbook has already been refreshed manually (or is otherwise
REM known good) and you just want to read what's in the cells now
REM and push it to Supabase.
REM
REM Behavior:
REM   - Still triggers the Master List "Refresh Positions" macro at
REM     the top of the run (positions populate in ~15s; this isn't
REM     the slow step).
REM   - SKIPS the ~300s FactSet Refresh Workbook wait and the
REM     post-refresh staleness check.
REM   - Reads every sheet (Prices, Valuation, FX, Performance1,
REM     Rep Holdings, Markets, Metrics, Transactions, Earnings)
REM     and pushes to Supabase same as the full script.
REM
REM If the workbook hasn't been refreshed, prices/metrics will be
REM whatever vintage was last saved in the file. The script's
REM "fewer than 50 prices read" abort gate still fires if FactSet
REM error codes blanked everything out.
REM ---------------------------------------------------------------

REM Run from the scripts directory so relative paths in the .py
REM script resolve the same as when launched manually.
cd /d "%~dp0"

python "%~dp0factset_pull.py" --skip-refresh

REM Pause so a double-click run leaves the window open long enough
REM to read the tail of the log line. Comment out if scheduling
REM this through Task Scheduler instead.
echo.
echo === Done. Log: \\FS01\USERS\khill\Research Hub\factset_pull.log ===
pause
