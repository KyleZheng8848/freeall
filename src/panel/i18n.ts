import { panelApp } from "./app.js";
import { english } from "../i18n/messages.js";
import { matchLocale, resolveLocale, translate, type Locale } from "../i18n/core.js";

/** JSON used in an inline script must not be able to terminate the script element. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

// Ship only dynamic panel messages; server-rendered page labels need no browser catalog.
const panelMessages = Object.fromEntries([...panelApp.matchAll(/tr\(("(?:[^"\\]|\\.)*")/g)]
  .map((match) => JSON.parse(match[1]) as string)
  .filter((message) => message in english)
  .map((message) => [message, english[message]]));

export function browserI18n(locale: Locale): string {
  return `
const english = ${scriptJson(panelMessages)};
const matchLocale = ${matchLocale.toString()};
const resolveLocale = ${resolveLocale.toString()};
const translate = ${translate.toString()};
const locale = ${scriptJson(locale)};
const tr = (message, ...params) => translate(locale, message, ...params);
const languageSelect = document.getElementById("language-select");
if (languageSelect) {
  const cookie = document.cookie.split(";").map(v => v.trim()).find(v => v.startsWith("freeall-lang="));
  const queryLang = new URL(location.href).searchParams.get("lang");
  languageSelect.value = matchLocale(queryLang) || (cookie ? matchLocale(cookie.slice(13)) : "auto") || "auto";
  languageSelect.addEventListener("change", () => {
    const preference = languageSelect.value;
    document.cookie = "freeall-lang=" + (preference === "auto" ? "" : preference) + "; Path=/; SameSite=Strict; Max-Age=" + (preference === "auto" ? "0" : "31536000");
    const url = new URL(location.href);
    url.searchParams.delete("lang");
    window.location.assign(url.href);
  });
}
`;
}
