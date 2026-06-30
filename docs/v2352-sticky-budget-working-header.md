# v2.35.2 Sticky Budget Working Header

The Budget screen now keeps the active budgeting context visible while rows scroll underneath.

## Sticky region

The sticky region starts at the working context, not the global application chrome.

Sticky:

- month navigation
- Ready To Assign summary
- Budget display actions
- Budget column header

Scrollable:

- global application header
- any page chrome above the Budget workspace

This mirrors the Register sticky header philosophy without forcing the Budget screen to use identical content. The sticky region begins where the user starts doing budget work: the selected month.

## Non-goals

- Do not make the global application header sticky.
- Do not change Budget data, calculations, or category ordering.
- Do not move display actions out of the header yet; that remains a separate product-polish item.
