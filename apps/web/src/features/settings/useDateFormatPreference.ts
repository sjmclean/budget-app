import { useEffect, useState } from "react";
import {
  getStoredDateFormatPreference,
  SETTINGS_PREFERENCES_CHANGED_EVENT,
} from "./dateFormatting";
import type { DateFormatPreference } from "./settingsPreferences";

export function useDateFormatPreference(): DateFormatPreference {
  const [dateFormat, setDateFormat] = useState<DateFormatPreference>(() => getStoredDateFormatPreference());

  useEffect(() => {
    function refreshDateFormat() {
      setDateFormat(getStoredDateFormatPreference());
    }

    window.addEventListener(SETTINGS_PREFERENCES_CHANGED_EVENT, refreshDateFormat);
    window.addEventListener("storage", refreshDateFormat);

    return () => {
      window.removeEventListener(SETTINGS_PREFERENCES_CHANGED_EVENT, refreshDateFormat);
      window.removeEventListener("storage", refreshDateFormat);
    };
  }, []);

  return dateFormat;
}
