export const supportedLanguages = ["pt", "en", "es", "de"] as const;
export const languageLabels: Record<(typeof supportedLanguages)[number], string> = { pt: "Português", en: "Inglês", es: "Espanhol", de: "Alemão" };
