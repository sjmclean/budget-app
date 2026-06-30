# v2.38.1 Register Search Enter Default

Search suggestions are useful shortcuts, but they should not hijack the default keyboard action.

## Behaviour

- Typing a query and pressing Enter now commits an all-fields search.
- Suggestions are only committed after the user explicitly highlights one with arrow keys or mouse hover.
- The search action group appears first so "Search in all fields" is easy to find.

This keeps the YNAB-style suggestion menu while making Enter behave like a normal search box.
