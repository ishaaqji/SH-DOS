import { MemoryStore, type Store } from "../kernel/store";
import { ValidationError } from "../kernel/errors";
import type { Language } from "./types";

const SEED_LANGUAGES: Array<Omit<Language, "id" | "createdAt" | "updatedAt">> = [
  { code: "en", name: "English", nativeName: "English", locale: "en", isDefault: true, isActive: true },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", locale: "hi", isDefault: false, isActive: true },
  { code: "bn", name: "Bengali", nativeName: "বাংলা", locale: "bn", isDefault: false, isActive: true },
  { code: "te", name: "Telugu", nativeName: "తెలుగు", locale: "te", isDefault: false, isActive: true },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்", locale: "ta", isDefault: false, isActive: true },
  { code: "kn", name: "Kannada", nativeName: "ಕನ್ನಡ", locale: "kn", isDefault: false, isActive: true },
  { code: "ml", name: "Malayalam", nativeName: "മലയാളം", locale: "ml", isDefault: false, isActive: true },
  { code: "mr", name: "Marathi", nativeName: "मराठी", locale: "mr", isDefault: false, isActive: true },
  { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી", locale: "gu", isDefault: false, isActive: true },
  { code: "ur", name: "Urdu", nativeName: "اردو", locale: "ur", isDefault: false, isActive: true },
  { code: "sa", name: "Sanskrit", nativeName: "संस्कृतम्", locale: "sa", isDefault: false, isActive: true },
];

export class LanguageRegistry {
  private store: Store<Language>;

  constructor(store?: Store<Language>) {
    this.store = store ?? new MemoryStore<Language>();
    if (this.store.list().length === 0) {
      for (const language of SEED_LANGUAGES) {
        this.store.insert({
          ...language,
          id: language.code,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }

  list(): Language[] {
    return this.store.list();
  }

  active(): Language[] {
    return this.store.find((l) => l.isActive);
  }

  get(code: string): Language | undefined {
    return this.store.get(code);
  }

  require(code: string): Language {
    const language = this.get(code);
    if (!language) throw new ValidationError(`Unknown language code ${code}`);
    if (!language.isActive) throw new ValidationError(`Language ${code} is inactive`);
    return language;
  }

  register(input: {
    code: string;
    name: string;
    nativeName?: string;
    locale?: string;
    isActive?: boolean;
  }): Language {
    if (this.get(input.code)) throw new ValidationError(`Language ${input.code} already registered`);
    const language: Language = {
      id: input.code,
      code: input.code,
      name: input.name,
      nativeName: input.nativeName ?? input.name,
      locale: input.locale ?? input.code,
      isDefault: this.store.list().length === 0,
      isActive: input.isActive ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return this.store.insert(language);
  }

  default(): Language {
    return this.store.list().find((l) => l.isDefault) ?? this.store.list()[0];
  }

  fallbackChain(code: string): string[] {
    const chain: string[] = [];
    const push = (c: string | undefined) => {
      if (c && !chain.includes(c)) chain.push(c);
    };
    push(code);
    if (code.includes("-")) push(code.split("-")[0]);
    push(this.default().code);
    push("en");
    return chain;
  }
}
