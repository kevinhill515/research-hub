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
  { id: "5D%",       label: "5D%",       sort: "5D%",           compact: true  },
  { id: "MOS",       label: "MOS",       sort: "MOS",           compact: true  },
  { id: "MOS Fixed", label: "MOS Fixed", sort: "MOS Fixed",     compact: true  },
  { id: "FPE Range", label: "FPE Range", sort: null,            compact: true  },
  { id: "Country",   label: "Country",   sort: "Country",       compact: false },
  { id: "Sector",    label: "Sector",    sort: "Sector",        compact: false },
  { id: "Portfolio", label: "Portfolio", sort: null,            compact: false },
  { id: "Action",    label: "Action",    sort: null,            compact: false },
  { id: "Notes",     label: "Notes",     sort: null,            compact: false },
  { id: "Reviewed",  label: "Reviewed",  sort: "Last Reviewed", compact: true  },
  { id: "Updated",   label: "Updated",   sort: "Last Updated",  compact: false },
  { id: "Status",    label: "Status",    sort: null,            compact: true  },
  { id: "Flag",      label: "Flag",      sort: null,            compact: true  },
  { id: "Del",       label: "Del",       sort: null,            compact: true  },
];

/* Derived views for backward compat with existing consumers. */
export const ALL_COLS = COMPANY_COLUMNS.map(function (c) { return c.id; });
export const COMPACT_COLS = new Set(
  COMPANY_COLUMNS.filter(function (c) { return c.compact; }).map(function (c) { return c.id; })
);
