import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { mr } from "./mr";

export type Lang = "en" | "mr";

const STORAGE_KEY = "ofc_lang";

// English is the source language: the t() fallback is the English text itself,
// so any string that has not been translated yet still renders in English.
const DICTS: Record<Lang, Record<string, string>> = {
  en: {},
  mr,
};

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Translate a UI string; falls back to English (the key itself). */
  t: (text: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function readStoredLang(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === "mr" ? "mr" : "en";
  } catch {
    return "en";
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang);

  useEffect(() => {
    document.documentElement.lang = lang === "mr" ? "mr" : "en";
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (text: string, vars?: Record<string, string | number>) => {
      let out = DICTS[lang][text] ?? text;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          out = out.split(`{${k}}`).join(String(v));
        }
      }
      return out;
    },
    [lang]
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within LanguageProvider");
  return ctx;
}
