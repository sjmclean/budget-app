# v3.22.9 Importer mockup-aligned layout

This milestone aligns the production importer with the approved visual mockup while preserving the v3.22.8 workflow semantics.

Key changes:

- destination account selector moves into the File step;
- the dialog header becomes a compact title and close control;
- Setup uses compact side-by-side detected controls and examples;
- Review cards use coloured header strips for existing, new, and invalid tasks;
- only genuine register matches use A/B rows;
- new transactions and transfers remain single-row cards;
- edit and decision controls remain below the transaction rows;
- positive and negative amount colours remain financial green and red.

Run:

```bash
pnpm verify:v3229
```
