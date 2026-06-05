@echo off
REM Launches the FactSet scheduler in a PowerShell window. Drop a
REM shortcut to this file into shell:startup so it runs automatically
REM at logon and survives reboots. The scheduler itself loops and
REM fires factset_pull.py every Monday-Saturday at 7:30 AM PT.
REM
REM See scripts/factset_scheduler.py for behavior + scripts/README.md
REM for the full setup notes.
cd /d "H:\Research Hub\research-hub-main"
start "FactSet Scheduler" powershell -NoExit -Command "python scripts\factset_scheduler.py"
