import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "coverage/**", "test-results/**"],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "constructor-super": js.configs.recommended.rules["constructor-super"],
      "for-direction": js.configs.recommended.rules["for-direction"],
      "getter-return": js.configs.recommended.rules["getter-return"],
      "no-async-promise-executor": js.configs.recommended.rules["no-async-promise-executor"],
      "no-class-assign": js.configs.recommended.rules["no-class-assign"],
      "no-compare-neg-zero": js.configs.recommended.rules["no-compare-neg-zero"],
      "no-dupe-class-members": js.configs.recommended.rules["no-dupe-class-members"],
      "no-dupe-else-if": js.configs.recommended.rules["no-dupe-else-if"],
      "no-dupe-keys": js.configs.recommended.rules["no-dupe-keys"],
      "no-duplicate-case": js.configs.recommended.rules["no-duplicate-case"],
      "no-func-assign": js.configs.recommended.rules["no-func-assign"],
      "no-import-assign": js.configs.recommended.rules["no-import-assign"],
      "no-new-native-nonconstructor": js.configs.recommended.rules["no-new-native-nonconstructor"],
      "no-obj-calls": js.configs.recommended.rules["no-obj-calls"],
      "no-self-assign": js.configs.recommended.rules["no-self-assign"],
      "no-setter-return": js.configs.recommended.rules["no-setter-return"],
      "no-unreachable": js.configs.recommended.rules["no-unreachable"],
      "no-unreachable-loop": "error",
      "no-unsafe-negation": js.configs.recommended.rules["no-unsafe-negation"],
      "no-with": js.configs.recommended.rules["no-with"],
      "use-isnan": js.configs.recommended.rules["use-isnan"],
      "valid-typeof": js.configs.recommended.rules["valid-typeof"],
      "react-hooks/rules-of-hooks": "error",
    },
  },
);
