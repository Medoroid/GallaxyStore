"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Locale, defaultLocale, dir, t as translate } from "@/lib/i18n";

type LanguageContextType = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  dir: "ltr" | "rtl";
};

const LanguageContext = createContext<LanguageContextType>({
  locale: defaultLocale,
  setLocale: () => {},
  t: (key) => key,
  dir: "ltr",
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  useEffect(() => {
    const saved = localStorage.getItem("galaxy-locale") as Locale;
    if (saved && (saved === "en" || saved === "ar") && saved !== locale) {
      setLocaleState(saved);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir[locale];
    localStorage.setItem("galaxy-locale", locale);
  }, [locale]);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
  };

  const t = (key: string): string => {
    return translate(locale, key as Parameters<typeof translate>[1]);
  };

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t, dir: dir[locale] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
