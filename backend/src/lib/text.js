// Text helpers shared by routes and mail templates.

/** First `maxWords` words followed by "…" when truncated (whitespace normalised, paragraphs kept as spaces). */
export function preview(text, maxWords = 150) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return words.slice(0, maxWords).join(' ') + '…';
}

/** First ~`max` characters, cut at a word boundary. */
export function snippet(text, max = 200) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s.,;:!?-]+$/, '') + '…';
}

/** Minimal HTML escaping for e-mail templates. */
export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Strip CR/LF so user input can never inject e-mail headers. */
export const oneLine = (s) => String(s ?? '').replace(/[\r\n\p{Zl}\p{Zp}]+/gu, ' ').trim();
