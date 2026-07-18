# Product and Interaction Design Principles

These principles guide product and UI decisions across the application. They are intentionally short and should be used when reviewing new features or revisiting existing workflows.

## 1. Show data before configuration

Users should see their budget, transactions, or results before being asked to configure the software. Settings should appear only when automatic interpretation is insufficient or the user needs to correct the displayed result.

## 2. Detect first, ask only when necessary

The application should use file contents, account context, previous successful behaviour, and application preferences before asking the user a question. Unambiguous evidence always wins over remembered behaviour.

## 3. Prefer direct manipulation

When practical, users should edit the thing they are looking at. Prefer inline controls, editable fields, and contextual actions over separate setup screens or management dialogs.

## 4. Ask about the user's data, not the implementation

Questions should be expressed in financial terms: whether a transaction matches, which account a transfer uses, or what payee name is correct. Avoid exposing parser internals, confidence percentages, rules, profiles, or technical diagnostics in the normal workflow.

## 5. Learn quietly from explicit actions

When a user clearly corrects a payee, account destination, file interpretation, or similar value, the application may remember that outcome for future use. Do not add repeated “remember this” prompts or user-managed profiles unless there is a proven need.

## 6. Store evidence, derive intelligence

Persist objective facts such as occurrence counts, timestamps, aliases, category usage, account usage, and transfer usage. Derive likely defaults and confidence at runtime rather than storing calculated confidence scores.

## 7. Preserve history unless the user is correcting identity

Payee cleanup may update historical transactions after explicit confirmation because it corrects identity. Category choices describe intent and should not silently rewrite historical budgeting decisions.

## 8. Keep workflows reversible until commit

Multi-step workflows should retain enough session history to restore earlier decisions before final commit. After commit, the register or owning engine becomes the source of truth.

## 9. Desktop first, keyboard friendly

Primary workflows should be efficient with a mouse and keyboard, support familiar shortcuts, and use information-dense layouts without becoming cluttered. Mobile alternatives may differ while preserving the same underlying decisions.

## 10. Keep engine ownership clear

UI components coordinate user interaction but should not take ownership of business rules. Each engine owns its domain, and cross-engine workflows should use explicit service boundaries.
