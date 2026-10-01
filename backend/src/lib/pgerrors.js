// PostgreSQL SQLSTATE errors → API errors (so a constraint violation is a 4xx, never a 500).
import { HttpError, ValidationError } from '../errors.js';

export function mapPgError(err) {
  const code = err?.code;
  if (typeof code !== 'string' || !/^[0-9A-Z]{5}$/.test(code) || code.startsWith('FST')) return null;
  const column = /Key \((?:lower\()?([a-z_]+)\)?\)=/i.exec(err.detail ?? '')?.[1] ?? err.column ?? null;

  switch (code) {
    case '23505': { // unique_violation
      const e = new HttpError(409, 'conflict', 'That value is already in use.');
      if (column) e.fields = { [column]: 'is already in use' };
      return e;
    }
    case '23503': { // foreign_key_violation
      if (/still referenced/i.test(err.detail ?? '')) return new HttpError(409, 'conflict', 'This item is still in use and cannot be deleted.');
      return new ValidationError({ [column ?? '_']: 'refers to something that does not exist' });
    }
    case '23502': // not_null_violation
      return new ValidationError({ [err.column ?? '_']: 'is required' });
    case '23514': // check_violation
      return new ValidationError({ [column ?? '_']: 'is outside the allowed range or format' });
    case '22001': // string_data_right_truncation
      return new ValidationError({ _: 'A value is too long.' });
    case '22P02': case '22007': case '22008': case '22003': case '22021': // invalid text / datetime / numeric / byte sequence
      return new ValidationError({ _: 'A value has an invalid format.' });
    default:
      return null;
  }
}
