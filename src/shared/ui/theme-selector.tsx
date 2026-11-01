"use client";

import { useI18n } from "@/shared/i18n";
import { useTheme } from "@/shared/theme";

export function ThemeSelector() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  return <label className="field">
    {t("Appearance")}
    <select aria-label={t("Appearance")} value={theme} onChange={event => {
      const value = event.target.value;
      setTheme(value === "light" || value === "dark" ? value : "system");
    }}>
      <option value="light">{t("Light")}</option>
      <option value="dark">{t("Dark")}</option>
      <option value="system">{t("System")}</option>
    </select>
    <span className="settings-hint">{t("System follows your device’s appearance setting.")}</span>
  </label>;
}
