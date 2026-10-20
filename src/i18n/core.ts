import { english } from "./messages.js";

export type Locale = "zh-CN" | "en";
export type LanguagePreference = Locale | "auto";
export const supportedLocales: readonly Locale[] = ["zh-CN", "en"];

/** Accept BCP 47, POSIX locale names and weighted Accept-Language headers. */
export function matchLocale(value?: string | null): Locale | undefined {
  if (!value) return undefined;
  if (/^(C|POSIX)([.@].*)?$/i.test(value.trim())) return "en";
  const candidates = value.split(",").map((entry, index) => {
    const [tag, ...params] = entry.trim().split(";");
    const quality = params.find((part) => part.trim().startsWith("q="));
    const q = quality ? Number(quality.trim().slice(2)) : 1;
    return { tag: tag.replace(/_/g, "-").replace(/[.@].*$/, "").toLowerCase(), q, index };
  }).filter((entry) => Number.isFinite(entry.q) && entry.q > 0 && entry.q <= 1)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { tag } of candidates) {
    if (tag === "zh" || tag.startsWith("zh-")) return "zh-CN";
    if (tag === "en" || tag.startsWith("en-")) return "en";
  }
  return undefined;
}

/** English is the fallback for unsupported environments. */
export function resolveLocale(...values: Array<string | null | undefined>): Locale {
  for (const value of values) {
    const locale = matchLocale(value);
    if (locale) return locale;
  }
  return "en";
}

export function translate(locale: Locale, message: string, ...params: unknown[]): string {
  const template = locale === "en" ? english[message] ?? message : message;
  return template.replace(/\{(\d+)\}/g, (token, index: string) =>
    Number(index) < params.length ? String(params[Number(index)]) : token);
}
