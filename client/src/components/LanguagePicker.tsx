import { useI18n } from "../i18n";

/** Compact English / Marathi toggle used at sign-in and in the app shell. */
export function LanguagePicker({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-full border border-field-200 bg-white/80 p-0.5 text-xs font-semibold shadow-sm backdrop-blur ${className}`}
      role="group"
      aria-label={t("Language")}
    >
      <button
        type="button"
        onClick={() => setLang("en")}
        className={`rounded-full px-3 py-1 transition-all duration-150 ${
          lang === "en"
            ? "bg-onion-700 text-white shadow-sm"
            : "text-field-500 hover:text-field-800"
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang("mr")}
        className={`rounded-full px-3 py-1 transition-all duration-150 ${
          lang === "mr"
            ? "bg-onion-700 text-white shadow-sm"
            : "text-field-500 hover:text-field-800"
        }`}
      >
        मराठी
      </button>
    </div>
  );
}
