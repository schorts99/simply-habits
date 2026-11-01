"use client";

import { useI18n } from "@/shared/i18n";

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { t, language, setLanguage } = useI18n();
  return <label className={compact ? "language-selector compact" : "field language-selector"}>
    <span>{t("Language")}</span>
    <select aria-label={t("Language")} value={language} onChange={event => setLanguage(event.target.value === "es" ? "es" : "en")}>
      <option value="en">{t("English")}</option>
      <option value="es">{t("Spanish")}</option>
    </select>
  </label>;
}
