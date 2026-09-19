import { useLanguageOptions } from "@/hooks/useLanguageOptions";
import { useTranslation } from "react-i18next";

export default function LanguagePreference() {
  const { t } = useTranslation();
  const {
    currentLanguage,
    supportedLanguages,
    getLanguageName,
    changeLanguage,
  } = useLanguageOptions();

  return (
    <div className="flex items-center justify-between gap-x-6 py-4">
      <div className="flex flex-col gap-y-0.5">
        <p className="text-sm leading-6 font-semibold text-white">
          {t("customization.items.display-language.title")}
        </p>
        <p className="text-xs text-white/60">
          {t("customization.items.display-language.description")}
        </p>
      </div>
      <select
        name="userLang"
        className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-fit shrink-0 py-2 px-4"
        defaultValue={currentLanguage || "en"}
        onChange={(e) => changeLanguage(e.target.value)}
      >
        {supportedLanguages.map((lang) => {
          return (
            <option key={lang} value={lang}>
              {getLanguageName(lang)}
            </option>
          );
        })}
      </select>
    </div>
  );
}
