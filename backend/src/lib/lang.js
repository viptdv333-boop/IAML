// Second language support (docs/I18N.md): English is the source text, Mongolian ("mn") is optional per item.
export const LANGS = ['en', 'mn'];

/** ?lang=mn → "mn"; anything else → "en". */
export const langOf = (req) => (req?.query?.lang === 'mn' ? 'mn' : 'en');

const has = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * Pick the Mongolian text when it was requested AND exists, else the English one.
 *   pick('mn', row.title, row.title_mn)  → row.title_mn || row.title
 */
export const pick = (lang, en, mn) => (lang === 'mn' && has(mn) ? mn : en);

/** An item counts as translated when ALL the given Mongolian values exist (title + main text). */
export const translated = (lang, ...mnValues) => lang === 'mn' && mnValues.length > 0 && mnValues.every(has);
