#!/usr/bin/env python
"""
factset_pull_skip_refresh.py

Thin wrapper around factset_pull.py that injects the --skip-refresh
flag and invokes the same main(). Used when the Research Hub Upload
workbook has already been refreshed manually (or is otherwise known
good) and we just want to read what's currently in the cells and
push to Supabase.

Behavior:
  - Still triggers the Master List "Refresh Positions" macro at the
    top of the run (~15s, unrelated to the FactSet 300s wait).
  - SKIPS the FactSet Refresh Workbook SendKeys + 300s polling +
    staleness check.
  - Reads every sheet (Prices, Valuation, FX, Performance1, Rep
    Holdings, Markets, Metrics, Transactions, Earnings) and pushes
    to Supabase identically to the full script.

Lives as a .py so corporate antivirus can't quarantine it the way
it kept doing to the .bat equivalent — Python source files on the
network share are typically allowlisted, .bat files are not.

Run from anywhere:
    python "\\\\FS01\\USERS\\khill\\Research Hub\\research-hub-main\\scripts\\factset_pull_skip_refresh.py"

Or with the workbook open and refreshed, just double-click this
file in Explorer if you have .py associated with a Python launcher
(py.exe / pythonw — make sure the launcher passes args through, the
standard "Python Launcher for Windows" does).
"""
from __future__ import annotations

import os
import sys


def main() -> int:
    # The script's home directory — adjacent to factset_pull.py.
    here = os.path.dirname(os.path.abspath(__file__))

    # factset_pull.main() reads sys.argv directly, so inject the
    # flag before importing. Preserve argv[0] (Python's expected
    # convention) and append --skip-refresh.
    sys.argv = [sys.argv[0], "--skip-refresh"]

    # Make sure imports resolve relative to this directory in case
    # the user runs from elsewhere.
    if here not in sys.path:
        sys.path.insert(0, here)

    # Defer the import so the sys.argv injection takes effect first.
    import factset_pull  # noqa: E402

    return factset_pull.main()


if __name__ == "__main__":
    sys.exit(main())
