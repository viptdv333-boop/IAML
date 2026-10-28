// npm run i18n:check — completeness of the Mongolian dictionary (docs/I18N.md §4).
// Collects every English string the public site asks to translate:
//   * HTML: [data-i18n] (text or innerHTML), [data-i18n-attr] attribute values   (parsed with jsdom, so the keys are
//     exactly what the browser engine in assets/js/i18n.js computes)
//   * JS:   IAML.t("…") / t("…") calls with a string literal
// and compares them with assets/js/i18n-mn.js. Fails on: missing translations, placeholder / markup mismatches,
// stale entries nobody uses.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..');
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

const publicPages = () => readdirSync(REPO).filter((f) => f.endsWith('.html') && f !== 'admin.html').sort();
const publicScripts = () =>
  readdirSync(path.join(REPO, 'assets', 'js'))
    .filter((f) => f.endsWith('.js') && !/^(admin|i18n-)/.test(f) && f !== 'i18n.js')
    .sort();

function unquote(lit) {
  const q = lit[0];
  const body = lit.slice(1, -1);
  if (q === '"') return JSON.parse(lit);
  return JSON.parse(`"${body.replace(/\\'/g, "'").replace(/"/g, '\\"')}"`);
}

/** Map<English string, string[] where it is used>. */
export function collectKeys() {
  const keys = new Map();
  const add = (key, where) => {
    if (!key) return;
    if (!keys.has(key)) keys.set(key, []);
    keys.get(key).push(where);
  };

  for (const file of publicPages()) {
    const doc = new JSDOM(readFileSync(path.join(REPO, file), 'utf8')).window.document;
    for (const el of doc.querySelectorAll('[data-i18n]')) {
      add(norm(el.getAttribute('data-i18n') === 'html' ? el.innerHTML : el.textContent), file);
    }
    for (const el of doc.querySelectorAll('[data-i18n-attr]')) {
      for (const name of (el.getAttribute('data-i18n-attr') || '').split(/\s+/).filter(Boolean)) {
        if (el.hasAttribute(name)) add(norm(el.getAttribute(name)), `${file} [${name}]`);
      }
    }
  }

  const call = /(?:\bIAML\.t|(?<![\w$.])t)\(\s*("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')/g;
  const sources = [];
  for (const file of publicScripts()) {
    const src = readFileSync(path.join(REPO, 'assets', 'js', file), 'utf8');
    sources.push(src);
    for (const m of src.matchAll(call)) {
      try { add(unquote(m[1]), `assets/js/${file}`); } catch { add(`⚠ unreadable literal ${m[1]}`, `assets/js/${file}`); }
    }
  }
  return { keys, jsSource: sources.join('\n') };
}

export function loadDictionary() {
  const file = path.join(REPO, 'assets', 'js', 'i18n-mn.js');
  const dict = {};
  const IAML = { i18n: { add: (code, entries) => { if (code === 'mn') Object.assign(dict, entries); } } };
  vm.runInNewContext(readFileSync(file, 'utf8'), { window: { IAML }, IAML });
  return dict;
}

const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const tags = (s) => [...String(s).matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)].map((m) => m[1].toLowerCase()).sort().join(',');

export function check() {
  const { keys, jsSource } = collectKeys();
  const dict = loadDictionary();
  const problems = { missing: [], placeholders: [], markup: [], unsafe: [], stale: [] };

  for (const [key, where] of keys) {
    const value = dict[key];
    if (typeof value !== 'string' || value.trim() === '') { problems.missing.push({ key, where: [...new Set(where)] }); continue; }
    if (placeholders(key) !== placeholders(value)) problems.placeholders.push({ key, value });
    if (/<[a-z]/i.test(key) && tags(key) !== tags(value)) problems.markup.push({ key, value });
    if (/<\s*script|javascript:|\son\w+\s*=/i.test(value)) problems.unsafe.push({ key, value });
  }
  for (const key of Object.keys(dict)) {
    if (keys.has(key)) continue;
    const quoted = JSON.stringify(key);
    if (jsSource.includes(quoted) || jsSource.includes(`'${key.replace(/'/g, "\\'")}'`)) continue; // a string kept in a data table and passed to t() later
    problems.stale.push({ key });
  }
  return { total: keys.size, translated: keys.size - problems.missing.length, dictionarySize: Object.keys(dict).length, problems };
}

// CLI
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const r = check();
  const show = (title, list, fmt) => {
    if (!list.length) return;
    console.log(`\n${title} (${list.length})`);
    for (const x of list.slice(0, 40)) console.log('  - ' + fmt(x));
    if (list.length > 40) console.log(`  … and ${list.length - 40} more`);
  };
  console.log(`strings used by the site: ${r.total}, translated: ${r.translated}, dictionary entries: ${r.dictionarySize}`);
  show('MISSING translations', r.problems.missing, (x) => `${JSON.stringify(x.key.slice(0, 90))}  [${x.where.slice(0, 2).join(', ')}]`);
  show('placeholder mismatch', r.problems.placeholders, (x) => `${JSON.stringify(x.key.slice(0, 60))} → ${JSON.stringify(x.value.slice(0, 60))}`);
  show('markup mismatch', r.problems.markup, (x) => `${JSON.stringify(x.key.slice(0, 60))} → ${JSON.stringify(x.value.slice(0, 60))}`);
  show('unsafe values', r.problems.unsafe, (x) => JSON.stringify(x.key.slice(0, 60)));
  show('stale entries (not used by the site)', r.problems.stale, (x) => JSON.stringify(x.key.slice(0, 90)));
  const bad = Object.values(r.problems).some((l) => l.length);
  console.log(bad ? '\ni18n check FAILED' : '\ni18n check passed');
  process.exitCode = bad ? 1 : 0;
}
