/* Companies table column schema. Single source of truth for:
 *   - Column order
 *   - Display label
 *   - Sort key (null = not sortable)
 *   - Whether the column is shown by default in compact mode
 *
 * The header row (App.jsx), column-picker (checklist of visible cols), and
 * the row renderer (CoRow.jsx) all read from this list. Adding a new
 * column means exactly one edit here — plus the render case in CoRow.jsx
 * keyed on the same `id`. */

export const COMPANY_COLUMNS = [
  { id: "Tier(s)",   label: "Tier(s)",   sort: "Tier",          compact: true  },
  { id: "Name",      label: "Name",      sort: "Name",          compact: true  },
  /* FPE Range sits between Name and 5D% so the valuation context
     reads left-to-right alongside the company identity rather than
     being buried after the MOS columns. */
  { id: "FPE Range", label: "FPE Range", sort: null,            compact: true  },
  { id: "5D%",       label: "5D%",       sort: "5D%",           compact: true  },
  /* "MOS Live" = MOS computed from the LIVE PE × normalized EPS. Renamed
     from bare "MOS" to make the contrast with "MOS Fixed" (committed
     firm TP) visually explicit. The id stays "MOS" so saved column-
     visibility sets and sort state don't break. */
  { id: "MOS",       label: "MOS Live",  sort: "MOS",           compact: true  },
  { id: "MOS Fixed", label: "MOS Fixed", sort: "MOS Fixed",     compact: true  },
  { id: "Country",   label: "Country",   sort: "Country",       compact: false },
  { id: "Sector",    label: "Sector",    sort: "Sector",        compact: false },
  { id: "Portfolio", label: "Portfolio", sort: null,            compact: false },
  /* "TP Change" = the recommendation derived from the most recent
     earnings entry's tpChange (Increase/Decrease/No Action). Renamed
     from generic "Action" to name what it actually represents. id
     stays "Action" so saved visibility sets and the CoRow render
     case keep working without touching every reference. */
  { id: "Action",    label: "TP Change", sort: null,            compact: false },
  { id: "Notes",     label: "Notes",     sort: null,            compact: false },
  { id: "Updated",   label: "Updated",   sort: "Last Updated",  compact: false },
  { id: "Thesis",    label: "Thesis",    sort: null,            compact: true  },
  { id: "Status",    label: "Status",    sort: null,            compact: true  },
  /* "Del" column was removed — companies are rarely deleted (and when
     they need to be, the bulk dedupe / "Clear all" affordances on the
     Companies toolbar cover it). Dropping the column gives ~3rem back
     to the row before the right-edge scroll kicks in. */
];

/* Derived views for backward compat with existing consumers. */
export const ALL_COLS = COMPANY_COLUMNS.map(function (c) { return c.id; });
export const COMPACT_COLS = new Set(
  COMPANY_COLUMNS.filter(function (c) { return c.compact; }).map(function (c) { return c.id; })
);
