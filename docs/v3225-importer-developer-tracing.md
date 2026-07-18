# v3.22.5 Importer Developer Tracing

Importer decision traces are available only when Developer Performance Mode is enabled.
The normal review workflow remains neutral and does not expose scores, recommendations, or engine internals.

Each candidate may record structured stages for source capture, validation, merchant resolution,
reconciliation, proposal construction, duplicate-file recovery, review decisions, and commit outcome.
Traces can be inspected per row or copied as JSON from the importer dialog.

The trace is diagnostic metadata only. It never changes reconciliation or commit behaviour and is
stored with a resumable import session only while that session exists.
