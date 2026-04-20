/* Per-portfolio table column schema. Shared by the header, body, special
 * rows (CASH/DIVACC) and the TOTAL row so the cell count can never drift. */

export const PORTFOLIO_COLUMNS = [
  { id: "name",        label: "Company",      sort: "name",        align: "left"  },
  { id: "nextReport",  label: "Next Report",  sort: "nextReport",  align: "left"  },
  { id: "country",     label: "Country",      sort: "country",     align: "left"  },
  { id: "sector",      label: "Sector",       sort: "sector",      align: "left"  },
  { id: "portfolios",  label: "Portfolios",   sort: null,          align: "left"  },
  { id: "held",        label: "Held (mo)",    sort: "held",        align: "left"  },
  { id: "lastTrade",   label: "Last Trade",   sort: "lastTrade",   align: "left"  },
  { id: "price",       label: "Price",        sort: null,          align: "left"  },
  { id: "avgCost",     label: "Avg Cost",     sort: null,          align: "left"  },
  { id: "unreal",      label: "Unreal",       sort: "unreal",      align: "left"  },
  { id: "perf",        label: "5D%",          sort: "perf",        align: "left"  },
  { id: "mos",         label: "MOS",          sort: "mos",         align: "left"  },
  { id: "fpeRange",    label: "FPE Range",    sort: null,          align: "left"  },
  { id: "target",      label: "Target %",     sort: "target",      align: "left"  },
  { id: "rep",         label: "Rep %",        sort: "rep",         align: "left"  },
  { id: "diff",        label: "Diff",         sort: "diff",        align: "left"  },
];

/* Sort keys that should default to ascending when first clicked. Everything
 * else defaults to descending (largest first = most interesting at the top). */
export const ASC_SORTS = new Set(["name", "sector", "country", "nextReport"]);
