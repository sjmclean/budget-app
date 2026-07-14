import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const types = readFileSync(
  "apps/web/src/features/tags/transactionTagTypes.ts",
  "utf8",
);
const iconTypes = readFileSync(
  "apps/web/src/features/tags/transactionTagIconTypes.ts",
  "utf8",
);
const icons = readFileSync(
  "apps/web/src/features/tags/transactionTagIcons.tsx",
  "utf8",
);
const persistence = readFileSync(
  "apps/web/src/features/tags/transactionTagPersistence.ts",
  "utf8",
);
const service = readFileSync(
  "apps/web/src/features/tags/transactionTagService.ts",
  "utf8",
);
const manager = readFileSync(
  "apps/web/src/features/tags/TransactionTagManager.tsx",
  "utf8",
);
const appearance = readFileSync(
  "apps/web/src/features/tags/TransactionTagAppearancePicker.tsx",
  "utf8",
);
const row = readFileSync(
  "apps/web/src/features/accounts/components/TransactionRow.tsx",
  "utf8",
);

for (const colour of [
  "rose",
  "amber",
  "sky",
  "navy",
  "violet",
  "fuchsia",
  "sand",
]) {
  assert(types.includes(`| "${colour}"`), `Tag colour ${colour} must be typed`);
  assert(
    persistence.includes(`"${colour}"`),
    `Tag colour ${colour} must survive persistence`,
  );
}

assert(
  types.includes("icon?: TransactionTagIcon"),
  "Tag definitions must support an optional icon",
);
assert(
  iconTypes.includes("TRANSACTION_TAG_ICON_IDS") &&
    iconTypes.includes("isTransactionTagIcon"),
  "Tag icon IDs must be validated without importing UI code",
);
assert(
  icons.includes("transactionTagIconOptions") &&
    icons.includes("TransactionTagIconGraphic"),
  "Tag icons must have a reusable registry and renderer",
);
assert(
  persistence.includes("isTransactionTagIcon(record.icon)"),
  "Persisted icons must be validated and remain backward compatible",
);
assert(
  service.includes("icon?: TransactionTagIcon | null") &&
    service.includes("delete updated.icon"),
  "The tag service must support setting and clearing icons",
);
assert(
  manager.includes("TransactionTagAppearancePicker") &&
    manager.includes("icon: draft.icon"),
  "Tag management must expose icon and colour selection for new and existing tags",
);
assert(
  appearance.includes("Search for more icons") &&
    appearance.includes("Clear icon") &&
    appearance.includes("transactionTagColourOptions.map"),
  "The appearance picker must provide searchable icons, clearing, and the expanded palette",
);
assert(
  row.includes("TransactionTagIconGraphic") && row.includes("icon={tag.icon}"),
  "The Register tag picker must render each tag's selected icon",
);

console.log("v3.06 tag icon and expanded colour regression checks passed.");
