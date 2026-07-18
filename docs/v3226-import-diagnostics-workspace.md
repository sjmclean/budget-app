# v3.22.6 Import Diagnostics Workspace

Developer Performance Mode now unlocks a budget-scoped Import Diagnostics workspace.

Completed and failed imports persist a bounded diagnostic record containing commit audit metadata, candidate outcomes, proposals, validation errors, and structured stage traces. The workspace supports session and candidate filtering, JSON copy/export, individual deletion, and clearing all diagnostics.

Diagnostics are optional developer metadata. Storage failures never interrupt importing, normal users do not see the workspace, and no financial state is changed by diagnostics.
