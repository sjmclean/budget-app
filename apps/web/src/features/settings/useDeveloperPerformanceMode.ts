import { useEffect, useState } from "react";
import { getActiveKeyValueStorage } from "../persistence/activeKeyValueStorage";
import { SETTINGS_PREFERENCES_CHANGED_EVENT } from "./dateFormatting";
import { defaultSettingsPreferences, readSettingsPreferences } from "./settingsPreferences";

export function getStoredDeveloperPerformanceMode(): boolean {
  try {
    return readSettingsPreferences(getActiveKeyValueStorage()).general.developerPerformanceMode;
  } catch {
    return defaultSettingsPreferences.general.developerPerformanceMode;
  }
}

export function useDeveloperPerformanceMode(): boolean {
  const [enabled, setEnabled] = useState<boolean>(() => getStoredDeveloperPerformanceMode());

  useEffect(() => {
    function refreshDeveloperPerformanceMode() {
      setEnabled(getStoredDeveloperPerformanceMode());
    }

    window.addEventListener(SETTINGS_PREFERENCES_CHANGED_EVENT, refreshDeveloperPerformanceMode);
    window.addEventListener("storage", refreshDeveloperPerformanceMode);

    return () => {
      window.removeEventListener(SETTINGS_PREFERENCES_CHANGED_EVENT, refreshDeveloperPerformanceMode);
      window.removeEventListener("storage", refreshDeveloperPerformanceMode);
    };
  }, []);

  return enabled;
}
