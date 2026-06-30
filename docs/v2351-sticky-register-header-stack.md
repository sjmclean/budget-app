# v2.35.1 Sticky Register Header Stack

## Goal

Keep the register context visible while scrolling long account registers.

The sticky stack includes:

- account name and balance
- register toolbar/actions
- selection action bar when a transaction is selected
- register column header

Month separators continue to scroll with the transactions because they describe the visible transaction group rather than the register itself.

## Design decision

The entire top register context is sticky, not just the column header. This follows the desktop finance-register pattern used by applications such as BFB and Liquid Budget while also keeping Budget App's account balance context visible.

## Non-goals

This release does not add sorting, filtering, column menus, or sticky month group headers. It only establishes the sticky register context stack.
