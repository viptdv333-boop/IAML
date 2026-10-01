// Tiny declarative validation: validate({ field: v.str({ max: 80 }) }, body) → cleaned object or ValidationError.
import { ValidationError, notFound } from '../errors.js';

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
const CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;

class Rule {
  constructor(fn, { optional = false } = {}) {
    this.fn = fn;
    this.isOptional = optional;
  }
  /** Field may be absent / null / "" → returns `def` (or undefined when absent so partial updates can skip it). */
  optional(def) {
    const r = new Rule(this.fn, { optional: true });
    r.def = def;
    return r;
  }
}

const normalizeText = (s) => s.normalize('NFC');

export const v = {
  /** Plain text. Trims, rejects control chars, enforces length. `multiline` keeps \n. */
  str({ min = 1, max = 1000, multiline = false, trim = true } = {}) {
    return new Rule((val, name) => {
      if (typeof val !== 'string') throw `${name} must be text`;
      let s = normalizeText(trim ? val.trim() : val);
      if (multiline) s = s.replace(/\r\n?/g, '\n');
      if (CTRL_RE.test(multiline ? s.replace(/\n/g, '') : s)) throw 'contains invalid characters';
      if (!multiline && /[\n\r\p{Zl}\p{Zp}]/u.test(s)) throw 'must be a single line';
      if (s.length < min) throw min <= 1 ? 'is required' : `must be at least ${min} characters`;
      if (s.length > max) throw `must be at most ${max} characters`;
      return s;
    });
  },
  email() {
    return new Rule((val) => {
      if (typeof val !== 'string') throw 'must be an e-mail address';
      const s = val.trim().toLowerCase();
      if (s.length > 254 || CTRL_RE.test(s) || !EMAIL_RE.test(s)) throw 'must be a valid e-mail address';
      return s;
    });
  },
  /**
   * A person's name: letters (any script), combining marks, spaces, dots, hyphens, apostrophes. Names end up in
   * Discuss and in mail to third parties, so punctuation such as ":" "/" "!" is not allowed.
   */
  name({ max = 80 } = {}) {
    return new Rule((val) => {
      if (typeof val !== 'string') throw 'must be text';
      const s = normalizeText(val.trim()).replace(/\s+/g, ' ');
      if (!s) throw 'is required';
      if (s.length > max) throw `must be at most ${max} characters`;
      if (!NAME_RE.test(s)) throw 'may contain only letters, spaces, hyphens, apostrophes and dots';
      return s;
    });
  },
  int({ min = -2147483648, max = 2147483647 } = {}) {
    return new Rule((val) => {
      const n = typeof val === 'string' && /^-?\d+$/.test(val.trim()) ? Number(val) : val;
      if (!Number.isInteger(n)) throw 'must be a whole number';
      if (n < min || n > max) throw `must be between ${min} and ${max}`;
      return n;
    });
  },
  bool() {
    return new Rule((val) => {
      if (typeof val === 'boolean') return val;
      if (val === 'true' || val === 1 || val === '1') return true;
      if (val === 'false' || val === 0 || val === '0') return false;
      throw 'must be true or false';
    });
  },
  enum(values) {
    return new Rule((val) => {
      if (!values.includes(val)) throw `must be one of: ${values.join(', ')}`;
      return val;
    });
  },
  /** ISO-8601 timestamp (must carry an offset or Z) → normalized ISO UTC string. */
  iso() {
    return new Rule((val) => {
      if (typeof val !== 'string') throw 'must be a date-time';
      const s = val.trim();
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(s)) throw 'must be an ISO date-time with a time zone';
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) throw 'must be a valid date-time';
      const y = d.getUTCFullYear();
      if (y < 1990 || y > 2100) throw 'is out of range';
      return d.toISOString();
    });
  },
  url({ max = 2000 } = {}) {
    return new Rule((val) => {
      if (typeof val !== 'string') throw 'must be a URL';
      const s = val.trim();
      if (s.length > max) throw `must be at most ${max} characters`;
      let u;
      try { u = new URL(s); } catch { throw 'must be a valid http(s) URL'; }
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw 'must start with http:// or https://';
      return u.toString() === s || u.toString() === s + '/' ? s : u.toString();
    });
  },
  slug({ max = 60 } = {}) {
    return new Rule((val) => {
      if (typeof val !== 'string') throw 'must be text';
      const s = val.trim().toLowerCase();
      if (s.length > max || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)) throw 'may contain only lowercase letters, digits and single hyphens';
      return s;
    });
  },
  array(inner, { min = 0, max = 100 } = {}) {
    return new Rule((val, name) => {
      if (!Array.isArray(val)) throw 'must be a list';
      if (val.length < min || val.length > max) throw `must contain ${min}–${max} items`;
      return val.map((x, i) => {
        try { return runRule(inner, x, `${name}[${i}]`); } catch (e) { throw `item ${i + 1}: ${e}`; }
      });
    });
  },
  /** Nested object validated with its own spec. */
  object(spec) {
    return new Rule((val) => {
      if (!val || typeof val !== 'object' || Array.isArray(val)) throw 'must be an object';
      try {
        return validate(spec, val);
      } catch (e) {
        if (e instanceof ValidationError) throw Object.entries(e.fields).map(([k, m]) => `${k} ${m}`).join('; ');
        throw e;
      }
    });
  },
};

function runRule(rule, val, name) {
  const out = rule.fn(val, name);
  return out;
}

const isEmpty = (val) => val === undefined || val === null || (typeof val === 'string' && val.trim() === '');

/**
 * validate(spec, body, { partial })
 *  - required rule: missing/empty → "is required"
 *  - optional rule: missing → key omitted (partial) / default; empty string or null → default (null unless given)
 */
export function validate(spec, body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError({ _: 'A JSON object is required.' });
  }
  const out = {};
  const fields = {};
  for (const [name, rule] of Object.entries(spec)) {
    const present = Object.prototype.hasOwnProperty.call(body, name);
    const val = body[name];
    if (!present && partial) continue;
    if (isEmpty(val)) {
      if (rule.isOptional) { out[name] = rule.def === undefined ? null : rule.def; continue; }
      if (partial && !present) continue;
      fields[name] = 'is required';
      continue;
    }
    try {
      out[name] = runRule(rule, val, name);
    } catch (e) {
      fields[name] = typeof e === 'string' ? e : 'is invalid';
      if (typeof e !== 'string') throw e;
    }
  }
  if (Object.keys(fields).length) throw new ValidationError(fields);
  return out;
}

/** Number of whitespace-separated words. */
export const wordCount = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/** Rule helper: text limited by word count instead of characters (body of news etc.). */
export function words({ min = 1, maxWords = 500, maxChars = 8000 } = {}) {
  return new Rule((val) => {
    if (typeof val !== 'string') throw 'must be text';
    const s = normalizeText(val.replace(/\r\n?/g, '\n').trim());
    if (CTRL_RE.test(s.replace(/\n/g, ''))) throw 'contains invalid characters';
    if (s.length < min) throw 'is required';
    if (s.length > maxChars) throw `must be at most ${maxChars} characters`;
    if (wordCount(s) > maxWords) throw `must be at most ${maxWords} words (now ${wordCount(s)})`;
    return s;
  });
}

/** Parse ?limit=&offset= (+ optional max). */
export function paging(query, { max = 50, def = 20 } = {}) {
  const lim = Number.parseInt(query?.limit, 10);
  const off = Number.parseInt(query?.offset, 10);
  return {
    limit: Number.isFinite(lim) ? Math.min(Math.max(lim, 1), max) : def,
    offset: Number.isFinite(off) ? Math.max(off, 0) : 0,
  };
}

/** Escape a user string for use inside ILIKE '%…%'. */
export const likePattern = (q) => `%${String(q).trim().slice(0, 100).replace(/[\\%_]/g, '\\$&')}%`;

/** Path parameter → positive int, or a 404 (never a 500 from a malformed id). */
export function idParam(value) {
  const s = String(value);
  if (!/^\d{1,9}$/.test(s)) throw notFound();
  const n = Number(s);
  if (n < 1) throw notFound();
  return n;
}
