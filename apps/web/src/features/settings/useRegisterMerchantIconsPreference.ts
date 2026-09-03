import { useEffect, useState } from "react";
import { getActiveKeyValueStorage } from "../persistence/activeKeyValueStorage";
import { SETTINGS_PREFERENCES_CHANGED_EVENT } from "./dateFormatting";
import { defaultSettingsPreferences, readSettingsPreferences } from "./settingsPreferences";

export function getStoredRegisterMerchantIconsPreference(): boolean {
  try {
    return readSettingsPreferences(getActiveKeyValueStorage()).general.showMerchantIconsInRegister;
  } catch {
    return defaultSettingsPreferences.general.showMerchantIconsInRegister;
  }
}

export function useRegisterMerchantIconsPreference(): boolean {
  const [enabled, setEnabled] = useState(getStoredRegisterMerchantIconsPreference);

  useEffect(() => {
    function refreshPreference() {
      setEnabled(getStoredRegisterMerchantIconsPreference());
    }
    window.addEventListener(SETTINGS_PREFERENCES_CHANGED_EVENT, refreshPreference);
    window.addEventListener("storage", refreshPreference);
    return () => {
      window.removeEventListener(SETTINGS_PREFERENCES_CHANGED_EVENT, refreshPreference);
      window.removeEventListener("storage", refreshPreference);
    };
  }, []);

  return enabled;
}
