// Row → public JSON shape helpers (docs/API.md §1 "Shared object shapes").
export const avatarUrl = (file) => (file ? `/uploads/avatars/${file}` : null);

export const fullName = (first, last) => `${first ?? ''} ${last ?? ''}`.trim();

/** The logged-in user's own record. */
export function toSelf(u) {
  return {
    id: u.id,
    email: u.email,
    first_name: u.first_name,
    last_name: u.last_name,
    workplace: u.workplace,
    avatar_url: avatarUrl(u.avatar_file),
    role: u.role,
    lang: u.lang ?? 'en',
    created_at: u.created_at,
  };
}

/**
 * Public author card from a joined row whose columns are prefixed (default `author_`):
 * author_id, author_first_name, author_last_name, author_avatar_file, author_role.
 * A deleted account (author_id null) becomes "Deleted user".
 */
export function toAuthor(row, p = 'author_') {
  const id = row[`${p}id`];
  if (!id) return { id: null, name: 'Deleted user', first_name: '', last_name: '', avatar_url: null, role: 'member' };
  const first = row[`${p}first_name`];
  const last = row[`${p}last_name`];
  return {
    id,
    name: fullName(first, last),
    first_name: first,
    last_name: last,
    avatar_url: avatarUrl(row[`${p}avatar_file`]),
    role: row[`${p}role`] ?? 'member',
  };
}

/** Admin-only author card, includes contact data. */
export function toAuthorAdmin(row, p = 'author_') {
  const a = toAuthor(row, p);
  if (a.id) {
    a.email = row[`${p}email`] ?? null;
    a.workplace = row[`${p}workplace`] ?? null;
  }
  return a;
}
