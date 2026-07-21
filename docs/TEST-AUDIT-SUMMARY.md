# Test audit summary

Generated from repository contents by `node scripts/audit-tests.mjs`.

## Inventory

- Test files audited: **458**
- Files without recognised assertions: **120**
- Exact normalised duplicate candidates: **5**

## Classification

| Classification | Files |
|---|---:|
| quarantined | 4 |
| required | 331 |
| retired | 123 |

## Test type

| Type | Files |
|---|---:|
| contract | 7 |
| integration | 151 |
| performance | 7 |
| regression | 19 |
| structural | 226 |
| unit | 48 |

## Recommended disposition

| Disposition | Files |
|---|---:|
| investigated | 100 |
| replaced | 121 |
| retained | 114 |
| retired | 123 |

## Interpretation

This audit is deliberately conservative. A test is not retired solely because it is duplicated, structural, or lacks a recognised assertion. Those signals create review candidates. Existing required tests remain required until equivalent behavioural coverage is demonstrated. Roadmap and pending tests remain non-gating.

The per-file source of truth is [tests/test-audit.json](tests/test-audit.json).
