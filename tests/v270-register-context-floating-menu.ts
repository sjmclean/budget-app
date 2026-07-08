import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(
  "apps/web/src/features/accounts/components/RegisterContextMenu.tsx",
  "utf8",
);
const page = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");

assert.match(
  component,
  /export function RegisterContextMenu/,
  "Register context menu should be extracted as a reusable component.",
);
assert.match(
  component,
  /<FloatingMenu/,
  "Register context menu should use the shared FloatingMenu component.",
);
assert.match(
  component,
  /FloatingMenuHeading/,
  "Register context menu should use the shared floating menu heading.",
);
assert.match(
  component,
  /FloatingMenuList/,
  "Register context menu should use the shared floating menu list.",
);
assert.match(
  component,
  /register-context-menu-layer floating-menu-layer/,
  "Register context menu should keep register classes while adopting shared layer styling.",
);
assert.match(
  component,
  /register-context-menu floating-menu-panel/,
  "Register context menu should keep register classes while adopting shared panel styling.",
);
assert.match(
  component,
  /actions\.map/,
  "Register context menu should continue rendering existing selection action definitions.",
);
assert.match(
  component,
  /action\.variant === "danger"/,
  "Register context menu should preserve danger action styling.",
);
assert.match(
  component,
  /action\.variant === "success"/,
  "Register context menu should preserve success action styling.",
);
assert.match(
  component,
  /action\.pressed/,
  "Register context menu should preserve pressed action state.",
);
assert.match(
  component,
  /onClose\(\);\s*action\.onClick\(\);/,
  "Register context menu should close before running selected actions.",
);
assert.match(
  page,
  /register-context-menu-layer/,
  "Existing register context menu wiring should remain available until the page migration commit.",
);

console.log("v2.70 register context floating menu checks passed");
