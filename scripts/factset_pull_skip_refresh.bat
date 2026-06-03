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
REM Works whether placed in the scripts folder OR copied to Desktop
REM / Start Menu / wherever — pushd auto-maps the UNC path so the
REM Python child process gets a proper drive-letter cwd (raw CMD
REM doesn't accept UNC cwds and would otherwise reset to Windows\).
REM ---------------------------------------------------------------

REM Hardcode the script's home directory (UNC path) so this batch
REM is location-independent — it can live on Desktop, in Start
REM Menu, in scripts\, anywhere.
set "SCRIPT_DIR=\\FS01\USERS\khill\Research Hub\research-hub-main\scripts"

REM pushd maps a UNC path to a temporary drive letter under the
REM hood; cd /d would have failed with "UNC paths are not
REM supported. Defaulting to Windows directory."
pushd "%SCRIPT_DIR%" || (
  echo ERROR: Could not access %SCRIPT_DIR%
  echo Check the network share is reachable.
  pause
  exit /b 1
)

python "%SCRIPT_DIR%\factset_pull.py" --skip-refresh
set EXITCODE=%ERRORLEVEL%

popd

REM Pause so a double-click run leaves the window open long enough
REM to read the tail of the log line. Comment out if scheduling
REM this through Task Scheduler instead.
echo.
echo === Done (exit %EXITCODE%). Log: \\FS01\USERS\khill\Research Hub\factset_pull.log ===
pause
exit /b %EXITCODE%
