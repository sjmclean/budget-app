# v2.38.0 Register Search 2.0

Introduces the first register search milestone.

## Behaviour

- Search suggestions open while typing but the register is not filtered until the user commits a search.
- Suggestions are grouped into Payees, Categories, Memos, and Search actions.
- Enter commits the highlighted suggestion or defaults to a search action.
- Escape closes suggestions or clears an active committed search.
- Ctrl/Cmd+F focuses the register search box.
- A committed search filters the register before pagination and shows a status strip with result counts and a clear action.

## Scope

Stage 1 searches payee, category, memo/check number, split categories/memos, and simple amount text. Advanced dates, cleared state, flags, transfers, saved searches, and power-query syntax remain future work.
