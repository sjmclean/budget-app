import { createUserSettings } from "../packages/budget-engine/src/services/createUserSettings.js";
import { DateFormat } from "../packages/types/src/DateFormat.js";
import { NumberFormat } from "../packages/types/src/NumberFormat.js";
import { LanguageCode } from "../packages/types/src/LanguageCode.js";
import { ThemeMode } from "../packages/types/src/ThemeMode.js";

const settings = createUserSettings("user", "AUD");

console.log(settings);

console.log({
  ...settings,
  theme: ThemeMode.Dark,
  language: LanguageCode.EnglishAustralia,
  dateFormat: DateFormat.DD_MM_YYYY,
  numberFormat: NumberFormat.EnAU,
});
