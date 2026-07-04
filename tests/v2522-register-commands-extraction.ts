import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const registerCommandsSource = readFileSync(
  join(root, "apps/web/src/features/accounts/useRegisterCommands.ts"),
  "utf8",
);
const registerPageSource = readFileSync(
  join(root, "apps/web/src/pages/AccountRegisterPage.tsx"),
  "utf8",
);

function testRegisterCommandsHookExists() {
  assert.match(
    registerCommandsSource,
    /export function useRegisterCommands/,
    "Register commands should be extracted into a dedicated hook",
  );
  assert.match(registerCommandsSource, /selectTransaction/);
  assert.match(registerCommandsSource, /toggleTransactionSelection/);
  assert.match(registerCommandsSource, /editTransaction/);
  assert.match(registerCommandsSource, /toggleClearedTransaction/);
  assert.match(registerCommandsSource, /manageTransactionAttachments/);
  assert.match(registerCommandsSource, /updateTransactionFlag/);
}

function testRegisterPageUsesCommandsHook() {
  assert.match(
    registerPageSource,
    /from "\.\.\/features\/accounts\/useRegisterCommands"/,
    "Register page should import the extracted command hook",
  );
  assert.match(
    registerPageSource,
    /const registerCommands = useRegisterCommands\(/,
    "Register page should instantiate the command hook",
  );
  assert.doesNotMatch(
    registerPageSource,
    /const handleUpdateTransactionFlag = useCallback/,
    "Register page should not own transaction flag command orchestration",
  );
  assert.doesNotMatch(
    registerPageSource,
    /const handleManageTransactionAttachments = useCallback/,
    "Register page should not own attachment command orchestration",
  );
}

function testCommandsStayOutOfSelectionActions() {
  assert.doesNotMatch(
    registerCommandsSource,
    /confirmDialog/,
    "Selection confirmation workflows should remain in useRegisterSelectionActions",
  );
  assert.doesNotMatch(
    registerCommandsSource,
    /SelectionAction/,
    "Register commands should not build SelectionBar actions",
  );
}

function run() {
  testRegisterCommandsHookExists();
  testRegisterPageUsesCommandsHook();
  testCommandsStayOutOfSelectionActions();
  console.log("v2.52.2 register commands extraction checks passed");
}

run();
