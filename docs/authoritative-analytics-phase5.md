# Authoritative analytics — Phase 5

Dashboard and Reports now use the local-first SQLite analytics boundary exclusively.

- Dashboard reads its 12-month overview through `getFinancialOverview`.
- Ready to Assign and overspent-category counts come from the same authoritative budget projection used by the Budget screen.
- Spending by Category is grouped in SQLite for the selected month.
- Category transaction drill-down is bounded to 250 rows.
- The browser no longer loads every account register to recompute Dashboard or Report values.
- The obsolete browser financial-overview calculator has been removed.

If the SQLite analytics capability is unavailable, these screens report that condition instead of silently switching to a second financial calculation path.
