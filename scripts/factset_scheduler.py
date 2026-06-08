"""
Lightweight in-process scheduler for factset_pull.

Why this exists: Windows Task Scheduler has been unreliable on this
machine (silent-failure mode when set via the GUI). We run it our way
instead — launch this Python process once after logging on, leave it
minimized, and it fires factset_pull.py at 7:30 AM PT every
Monday-Saturday.

Behavior:
- On startup, computes the next 7:30 AM in Pacific Time (PST/PDT
  handled by the system clock — Windows tz database is the source of
  truth; this script assumes the machine clock IS in PT).
- Sleeps until that time.
- Skips Sundays (advances next_run by one day if it lands on Sunday).
- Runs scripts/factset_pull.py via subprocess, logs result, then
  loops to compute the next morning's 7:30 AM.
- Logs to scheduler.log next to factset_pull.log so you can see when
  each run fired and whether the subprocess succeeded.

How to run:
    cd "H:\\Research Hub\\research-hub-main"
    python scripts\\factset_scheduler.py

Leave the terminal window minimized. If you want it to auto-start on
logon, drop a shortcut to a .bat file containing the same command in
shell:startup. The script self-recovers on subprocess errors (logs and
keeps looping).

To stop: Ctrl-C in the terminal window or close it.
"""
import datetime
import subprocess
import sys
import time
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PULL_SCRIPT = os.path.join(SCRIPT_DIR, "factset_pull.py")
LOG_PATH = os.path.join(SCRIPT_DIR, "scheduler.log")

TARGET_HOUR = 7
TARGET_MIN  = 0
# Days the script runs. Monday=0 ... Sunday=6. Skip Sunday (6).
RUN_DAYS = {0, 1, 2, 3, 4, 5}  # Mon-Sat


def log(msg):
    stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = "[{}] {}".format(stamp, msg)
    print(line, flush=True)
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def next_run_time(now):
    """Compute the next datetime at TARGET_HOUR:TARGET_MIN that falls on a RUN_DAYS day."""
    candidate = now.replace(hour=TARGET_HOUR, minute=TARGET_MIN, second=0, microsecond=0)
    if candidate <= now:
        candidate += datetime.timedelta(days=1)
    # Skip Sundays (or any day not in RUN_DAYS).
    while candidate.weekday() not in RUN_DAYS:
        candidate += datetime.timedelta(days=1)
    return candidate


def run_pull():
    log("firing factset_pull.py")
    try:
        result = subprocess.run(
            [sys.executable, PULL_SCRIPT],
            cwd=SCRIPT_DIR,
            timeout=30 * 60,  # 30 min hard cap on the subprocess
        )
        log("factset_pull.py exited with code {}".format(result.returncode))
    except subprocess.TimeoutExpired:
        log("factset_pull.py TIMEOUT (>30 min) — killed")
    except Exception as e:
        log("factset_pull.py launch error: {}".format(e))


def main():
    log("scheduler started — target {:02d}:{:02d} Mon-Sat".format(TARGET_HOUR, TARGET_MIN))
    while True:
        now = datetime.datetime.now()
        run_at = next_run_time(now)
        sleep_s = (run_at - now).total_seconds()
        log("next run: {} ({} seconds from now)".format(
            run_at.strftime("%Y-%m-%d %H:%M:%S"),
            int(sleep_s),
        ))
        # Sleep in small chunks so Ctrl-C is responsive on Windows.
        while sleep_s > 0:
            chunk = min(60.0, sleep_s)
            time.sleep(chunk)
            sleep_s -= chunk
        run_pull()
        # Tiny pause so a fast-failing subprocess doesn't spam the loop.
        time.sleep(5)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("scheduler stopped (Ctrl-C)")
