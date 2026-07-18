# v3.22.3 Persistent Import Sessions

Transaction import review state is saved in budget-scoped browser storage while the review screen is active. Reopening the importer for the same account restores the file metadata, candidates, user decisions, edit origins, and import options. Closing the dialog preserves the session; explicitly discarding or successfully committing removes it.

This is review recovery, not financial Undo. No register state is written until the existing commit engine succeeds.
