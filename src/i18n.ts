import { AsyncLocalStorage } from "node:async_hooks";
import type { IncomingHttpHeaders } from "node:http";
import { resolveLocale, translate, type Locale } from "./i18n/core.js";
export { matchLocale, resolveLocale, type Locale } from "./i18n/core.js";

const context = new AsyncLocalStorage<Locale>();
let override: Locale | undefined;

export function systemLocale(): Locale {
  const env = process.env;
  return resolveLocale(env.LC_ALL || env.LC_MESSAGES || env.LANG, Intl.DateTimeFormat().resolvedOptions().locale);
}
export function currentLocale(): Locale {
  return context.getStore() ?? override ?? resolveLocale(process.env.FREEALL_LANG, systemLocale());
}
export function setLocale(locale: Locale): void { override = locale; }
export function withLocale<T>(locale: Locale, callback: () => T): T { return context.run(locale, callback); }
export function tr(message: string, ...params: unknown[]): string { return translate(currentLocale(), message, ...params); }

export function requestLocale(headers: IncomingHttpHeaders, url?: URL): Locale {
  const explicit = url?.searchParams.get("lang");
  const cookie = headers.cookie?.split(";").map((v) => v.trim()).find((v) => v.startsWith("freeall-lang="))?.slice(13);
  return resolveLocale(explicit, headers["x-freeall-language"] as string | undefined, cookie, headers["accept-language"] as string | undefined, currentLocale());
}
