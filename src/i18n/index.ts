/**
 * Language of the game screens: Thai (default) or English, chosen with the switch on the menu and kept on this device.
 *
 *   t().start              the UI text of the current language (src/i18n/th.ts and en.ts)
 *   bi('หมวก · Hat')        picks one side of a "ไทย · English" name (cosmetics)
 *   applyDom()             fills every [data-i18n], [data-i18n-html] and [data-i18n-aria] element on the page
 *   onLang(fn)             runs fn whenever the language changes (for text that is built in code)
 *
 * Words with no everyday Thai (PPE, Near Miss, E-Stop, LOTO, Toolbox Talk…) stay in English in the Thai text.
 * Game content that comes out of the shared sim (questions, tips, toasts) is translated in ./content.ts.
 */
import { LS } from '../lib/storage.js';
import { en } from './en.js';
import { th, type Dict } from './th.js';

export type Lang = 'th' | 'en';
export const LANGS: readonly Lang[] = ['th', 'en'];
const KEY = 'srLang';

let lang: Lang = LS.get<string>(KEY) === 'en' ? 'en' : 'th';
const listeners = new Set<(l: Lang) => void>();

export const getLang = () => lang;
export const t = (): Dict => (lang === 'en' ? en : th);

export function setLang(l: Lang) {
  if (l === lang) return;
  lang = l;
  LS.set(KEY, l);
  applyDom();
  for (const fn of listeners) fn(l);
}

export function onLang(fn: (l: Lang) => void) { listeners.add(fn); return () => listeners.delete(fn); }

const THAI = /[฀-๿]/;
export const hasThai = (s: string) => THAI.test(s);

/**
 * One language out of a bilingual "ไทย · English" string. Thai keeps everything up to its last Thai part (so a leading
 * number stays: "4 · ทองล้นตัว · Gold overflowing" → "4 · ทองล้นตัว"); English keeps the parts without Thai. A string
 * in one language only comes back as it is.
 */
export function bi(s: string, l: Lang = lang): string {
  const parts = s.split(' · ');
  if (parts.length < 2) return s;
  const lastThai = parts.reduce((k, p, i) => (hasThai(p) ? i : k), -1);
  if (lastThai < 0) return s;
  if (l === 'th') return parts.slice(0, lastThai + 1).join(' · ');
  const rest = parts.filter(p => !hasThai(p));
  return rest.length ? rest.join(' · ') : s;
}

type Key = keyof Dict;
const text = (k: string): string | null => {
  const v = (t() as Record<string, unknown>)[k];
  return typeof v === 'string' ? v : null;
};

/** fills the page's static text from the dictionary; elements whose key is missing keep what they had */
export function applyDom(root: ParentNode = document) {
  document.documentElement.lang = lang;
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) { const v = text(el.dataset.i18n as Key); if (v != null) el.textContent = v; }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-html]')) { const v = text(el.dataset.i18nHtml as Key); if (v != null) el.innerHTML = v; }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-aria]')) { const v = text(el.dataset.i18nAria as Key); if (v != null) el.setAttribute('aria-label', v); }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-alt]')) { const v = text(el.dataset.i18nAlt as Key); if (v != null) el.setAttribute('alt', v); }
}

/**
 * The TH / EN switch on the menu: a segmented pill whose yellow thumb slides to the chosen language.
 * The markup is in index.html (.lang-switch with one button per language).
 */
export function mountLangSwitch(el: HTMLElement, beep?: () => void) {
  const sync = () => {
    el.dataset.lang = lang;
    for (const b of el.querySelectorAll<HTMLButtonElement>('button[data-lang]')) {
      const on = b.dataset.lang === lang;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    }
  };
  el.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-lang]');
    if (!b || b.dataset.lang === lang) return;
    beep?.();
    setLang(b.dataset.lang as Lang);
  });
  // radio group keys: arrows move the choice
  el.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation();
    const next = LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length]!;
    setLang(next);
    el.querySelector<HTMLButtonElement>(`button[data-lang="${next}"]`)?.focus();
  });
  onLang(sync);
  sync();
}
