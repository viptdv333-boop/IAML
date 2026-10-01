// HTTP errors with a stable JSON shape (docs/API.md §1): { error: { code, message, fields? } }
export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.extra = extra; // merged into the error object (e.g. { email })
  }
}

export class ValidationError extends HttpError {
  constructor(fields, message = 'Please check the highlighted fields.') {
    super(400, 'validation_error', message);
    this.fields = fields;
  }
}

export const badRequest = (code, message, extra) => new HttpError(400, code, message, extra);
export const unauthenticated = (message = 'Please log in.') => new HttpError(401, 'unauthenticated', message);
export const forbidden = (message = 'You do not have access to this.', code = 'forbidden', extra) => new HttpError(403, code, message, extra);
export const notFound = (message = 'Not found.') => new HttpError(404, 'not_found', message);
export const conflict = (message) => new HttpError(409, 'conflict', message);
export const rateLimited = (message = 'Too many requests. Please try again later.', retryAfterSec = 60) =>
  new HttpError(429, 'rate_limited', message, { retryAfter: retryAfterSec });
