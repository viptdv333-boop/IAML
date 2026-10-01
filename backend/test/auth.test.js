import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { PASSWORD, client, createUser, lastCode, loginAs, mailTo, resetDb, startApp } from './helpers.js';

let ctx;
before(async () => { ctx = await startApp(); });
after(async () => { await ctx.close(); });
beforeEach(async () => { await resetDb(ctx.db); });

const ver = (email, code, password = PASSWORD) => ({ email, code, password });
const reg = (over = {}) => ({
  first_name: 'Ada', last_name: 'Lovelace', workplace: 'Analytical Engine Ltd', email: 'ada@example.org', password: PASSWORD, website: '', ...over,
});

describe('registration + e-mail confirmation', () => {
  test('register → code mailed → verify logs in; the code is single-use', async () => {
    const c = client(ctx.app);
    const r = await c.post('/api/auth/register', reg());
    assert.equal(r.status, 201);
    assert.deepEqual(r.body, { ok: true, status: 'verification_required', email: 'ada@example.org' });

    const mails = await mailTo(ctx.db, 'ada@example.org', 'verify_email');
    assert.equal(mails.length, 1);
    assert.equal(mails[0].subject, 'Your IAML confirmation code');
    assert.ok(mails[0].html_body.includes('Confirm your e-mail'));
    const code = await lastCode(ctx.db, 'ada@example.org');
    assert.ok(!mails[0].subject.includes(code) && !/Hello Ada/.test(mails[0].text_body), 'no code in the subject, no attacker-controlled name in the greeting');

    // cannot log in before confirming
    const early = await client(ctx.app).post('/api/auth/login', { email: 'ada@example.org', password: PASSWORD });
    assert.equal(early.status, 403);
    assert.equal(early.body.error.code, 'email_not_verified');
    assert.equal(early.body.error.email, 'ada@example.org');

    const v = await c.post('/api/auth/verify', ver('ada@example.org', code));
    assert.equal(v.status, 200);
    assert.equal(v.body.user.email, 'ada@example.org');
    assert.equal(v.body.user.workplace, 'Analytical Engine Ltd');
    assert.equal(v.body.user.role, 'member');
    assert.ok(c.jar.has('iaml_sid'));
    assert.match(v.headers['set-cookie'], /HttpOnly/i);
    assert.match(v.headers['set-cookie'], /SameSite=Lax/i);

    const me = await c.get('/api/auth/me');
    assert.equal(me.body.user.first_name, 'Ada');

    // the same code cannot be used twice
    const again = await client(ctx.app).post('/api/auth/verify', ver('ada@example.org', code));
    assert.equal(again.status, 400);
    assert.equal(again.body.error.code, 'invalid_code');
  });

  test('only a hash of the code is stored; wrong codes are counted and the code dies after 5 tries', async () => {
    const c = client(ctx.app);
    await c.post('/api/auth/register', reg());
    const code = await lastCode(ctx.db, 'ada@example.org');
    const row = await ctx.db.one('select code_hash, attempts from email_codes');
    assert.ok(Buffer.isBuffer(row.code_hash) && row.code_hash.length === 32);
    assert.ok(!row.code_hash.toString('utf8').includes(code));

    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const r = await c.post('/api/auth/verify', ver('ada@example.org', wrong));
      assert.equal(r.status, 400);
      assert.equal(r.body.error.code, 'invalid_code');
    }
    // 6th attempt with the CORRECT code: the code is burned
    const dead = await c.post('/api/auth/verify', ver('ada@example.org', code));
    assert.equal(dead.status, 400);
    assert.equal(dead.body.error.code, 'invalid_code');
  });

  test('expired codes are rejected', async () => {
    const c = client(ctx.app);
    await c.post('/api/auth/register', reg());
    const code = await lastCode(ctx.db, 'ada@example.org');
    await ctx.db.query(`update email_codes set expires_at = now() - interval '1 minute'`);
    const r = await c.post('/api/auth/verify', ver('ada@example.org', code));
    assert.equal(r.body.error.code, 'invalid_code');
  });

  test('does not reveal whether an address is registered', async () => {
    await createUser(ctx.db, { email: 'taken@example.org', first: 'Taken' });
    const c = client(ctx.app);
    const fresh = await c.post('/api/auth/register', reg({ email: 'fresh@example.org' }));
    const taken = await c.post('/api/auth/register', reg({ email: 'taken@example.org' }));
    assert.equal(fresh.status, 201);
    assert.equal(taken.status, 201);
    assert.deepEqual({ ...taken.body, email: 0 }, { ...fresh.body, email: 0 });
    // the owner is told instead, and no code is created for them
    const mail = await mailTo(ctx.db, 'taken@example.org', 'account_exists');
    assert.equal(mail.length, 1);
    assert.equal((await mailTo(ctx.db, 'taken@example.org', 'verify_email')).length, 0);
    // a second attempt within the hour does not mail-bomb the owner
    await c.post('/api/auth/register', reg({ email: 'taken@example.org' }));
    assert.equal((await mailTo(ctx.db, 'taken@example.org', 'account_exists')).length, 1);
    // the existing account is untouched
    assert.equal((await ctx.db.one(`select first_name from users where email = 'taken@example.org'`)).first_name, 'Taken');
  });

  test('re-registering an UNVERIFIED address: nothing changes while its code is live; afterwards the data is replaced', async () => {
    const c = client(ctx.app);
    await c.post('/api/auth/register', reg({ first_name: 'Old' }));
    await c.post('/api/auth/register', reg({ first_name: 'New', password: 'SomeOtherPass7!' }));
    assert.equal((await ctx.db.one(`select first_name from users where email = 'ada@example.org'`)).first_name, 'Old', 'a live code protects the pending data');
    assert.equal((await mailTo(ctx.db, 'ada@example.org', 'verify_email')).length, 1);

    await ctx.db.query(`update email_codes set expires_at = now() - interval '1 minute', created_at = now() - interval '20 minutes'`);
    await c.post('/api/auth/register', reg({ first_name: 'New' }));
    assert.equal((await ctx.db.one(`select first_name from users where email = 'ada@example.org'`)).first_name, 'New');
    const code = await lastCode(ctx.db, 'ada@example.org');
    assert.equal((await c.post('/api/auth/verify', ver('ada@example.org', code))).status, 200);
    assert.equal((await client(ctx.app).post('/api/auth/login', { email: 'ada@example.org', password: PASSWORD })).status, 200);
  });

  test('PRE-HIJACK: whoever registered an address first cannot keep access - the mailbox owner chooses the password at /verify', async () => {
    const attacker = client(ctx.app);
    await attacker.post('/api/auth/register', reg({ email: 'victim@example.org', first_name: 'Mallory', password: 'AttackerPass1!' }));
    const code = await lastCode(ctx.db, 'victim@example.org'); // delivered to the VICTIM's mailbox

    const victim = client(ctx.app);
    const v = await victim.post('/api/auth/verify', ver('victim@example.org', code, 'VictimsOwnPass9!'));
    assert.equal(v.status, 200);
    assert.equal((await client(ctx.app).post('/api/auth/login', { email: 'victim@example.org', password: 'AttackerPass1!' })).status, 401, "the attacker's password is gone");
    assert.equal((await client(ctx.app).post('/api/auth/login', { email: 'victim@example.org', password: 'VictimsOwnPass9!' })).status, 200);
    const guess = await attacker.post('/api/auth/verify', ver('victim@example.org', '000000', 'AttackerPass1!'));
    assert.equal(guess.status, 400);
  });

  test('verify needs a decent password; a rejected attempt does not burn the code', async () => {
    const c = client(ctx.app);
    await c.post('/api/auth/register', reg());
    const code = await lastCode(ctx.db, 'ada@example.org');
    const none = await c.post('/api/auth/verify', { email: 'ada@example.org', code });
    assert.equal(none.status, 400);
    assert.ok(none.body.error.fields.password);
    const weak = await c.post('/api/auth/verify', ver('ada@example.org', code, 'password123'));
    assert.equal(weak.status, 400);
    assert.ok(weak.body.error.fields.password);
    assert.equal((await c.post('/api/auth/verify', ver('ada@example.org', code))).status, 200);
  });

  test('every failed verification looks the same (unknown, already confirmed, disabled, wrong code)', async () => {
    await createUser(ctx.db, { email: 'done@example.org' });
    await createUser(ctx.db, { email: 'off@example.org', disabled: true });
    await client(ctx.app).post('/api/auth/register', reg());
    const c = client(ctx.app);
    const outcomes = [];
    for (const e of ['ghost@example.org', 'done@example.org', 'off@example.org', 'ada@example.org']) {
      const r = await c.post('/api/auth/verify', ver(e, '123456'));
      outcomes.push([r.status, r.body.error.code, r.body.error.message]);
    }
    assert.ok(outcomes.every((o) => JSON.stringify(o) === JSON.stringify(outcomes[0])), JSON.stringify(outcomes));
    assert.equal(outcomes[0][1], 'invalid_code');
  });

  test('names cannot carry links or sentences (they end up in Discuss and in mail to third parties)', async () => {
    const c = client(ctx.app);
    for (const bad of ['Account locked! Log in: https://evil.example/login', 'a/b', 'Ada<b>', '12345', 'x'.repeat(81)]) {
      const r = await c.post('/api/auth/register', reg({ first_name: bad }));
      assert.equal(r.status, 400, bad);
      assert.ok(r.body.error.fields.first_name, bad);
    }
    let n = 0;
    for (const good of ['Ada', "O'Brien", 'Jean-Pierre', 'Saiyinjiya', '\u0411\u0430\u0442-\u042d\u0440\u0434\u044d\u043d\u044d', '\u674e\u660e', 'Dr. Smith']) {
      n += 1;
      const r = await client(ctx.app).post('/api/auth/register', reg({ first_name: good, email: `name${n}@example.org` }));
      assert.equal(r.status, 201, good);
    }
  });

  test('validation errors name the offending fields', async () => {
    const c = client(ctx.app);
    const r = await c.post('/api/auth/register', { first_name: '', last_name: 'X', workplace: '', email: 'not-an-email', password: 'short' });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, 'validation_error');
    for (const f of ['first_name', 'workplace', 'email', 'password']) assert.ok(r.body.error.fields[f], `field ${f}`);
    const weak = await c.post('/api/auth/register', reg({ password: 'password123' }));
    assert.equal(weak.status, 400);
    assert.ok(weak.body.error.fields.password);
  });

  test('honeypot: bots get a fake success and nothing is stored', async () => {
    const c = client(ctx.app);
    const r = await c.post('/api/auth/register', reg({ website: 'http://spam.example' }));
    assert.equal(r.status, 201);
    assert.equal((await ctx.db.one('select count(*)::int as n from users')).n, 0);
    assert.equal((await ctx.db.one('select count(*)::int as n from mail_outbox')).n, 0);
  });

  test('resend: silent cool-down (60 s) and hourly cap', async () => {
    const c = client(ctx.app);
    await c.post('/api/auth/register', reg());
    const first = await lastCode(ctx.db, 'ada@example.org');
    const r1 = await c.post('/api/auth/resend', { email: 'ada@example.org', purpose: 'verify_email' });
    assert.equal(r1.status, 202);
    assert.equal((await mailTo(ctx.db, 'ada@example.org', 'verify_email')).length, 1, 'cool-down: no second mail yet');

    await ctx.db.query(`update email_codes set created_at = now() - interval '2 minutes'`);
    await c.post('/api/auth/resend', { email: 'ada@example.org', purpose: 'verify_email' });
    const second = await lastCode(ctx.db, 'ada@example.org');
    assert.equal((await mailTo(ctx.db, 'ada@example.org', 'verify_email')).length, 2);
    // the older code stopped working when the new one was issued (unless both happen to be equal)
    if (second !== first) {
      assert.equal((await client(ctx.app).post('/api/auth/verify', ver('ada@example.org', first))).status, 400);
    }
    // unknown e-mail: same 202, no mail
    const none = await c.post('/api/auth/resend', { email: 'ghost@example.org', purpose: 'verify_email' });
    assert.equal(none.status, 202);
    assert.equal((await mailTo(ctx.db, 'ghost@example.org')).length, 0);
  });
});

describe('login / logout / sessions', () => {
  test('login success, wrong password, unknown user (same error), disabled account', async () => {
    const u = await createUser(ctx.db, { email: 'bat@example.org' });
    await createUser(ctx.db, { email: 'off@example.org', disabled: true });
    const c = client(ctx.app);

    const bad = await c.post('/api/auth/login', { email: 'bat@example.org', password: 'wrong-password' });
    const ghost = await c.post('/api/auth/login', { email: 'ghost@example.org', password: 'wrong-password' });
    assert.equal(bad.status, 401);
    assert.deepEqual(bad.body, ghost.body, 'no user enumeration');

    const ok = await c.post('/api/auth/login', { email: 'BAT@Example.org', password: PASSWORD });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.id, u.id);
    assert.ok(!('password_hash' in ok.body.user));
    assert.equal((await c.get('/api/auth/me')).body.user.email, 'bat@example.org');

    const off = await client(ctx.app).post('/api/auth/login', { email: 'off@example.org', password: PASSWORD });
    assert.equal(off.status, 403);
    assert.equal(off.body.error.code, 'account_disabled');
  });

  test('login throttle: 5 failures per e-mail lock further attempts (even with the right password)', async () => {
    await createUser(ctx.db, { email: 'lock@example.org' });
    for (let i = 0; i < 5; i++) {
      const r = await client(ctx.app).post('/api/auth/login', { email: 'lock@example.org', password: 'nope-nope' });
      assert.equal(r.status, 401);
    }
    const blocked = await client(ctx.app).post('/api/auth/login', { email: 'lock@example.org', password: PASSWORD });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, 'rate_limited');
    assert.ok(Number(blocked.headers['retry-after']) > 0);
  });

  test('login of an unverified user mails a fresh code', async () => {
    await createUser(ctx.db, { email: 'new@example.org', verified: false });
    const r = await client(ctx.app).post('/api/auth/login', { email: 'new@example.org', password: PASSWORD });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, 'email_not_verified');
    assert.equal((await mailTo(ctx.db, 'new@example.org', 'verify_email')).length, 1);
  });

  test('logout ends the session server-side; /me never 401s', async () => {
    const u = await createUser(ctx.db);
    const c = await loginAs(ctx.app, u);
    assert.ok((await c.get('/api/auth/me')).body.user);
    const stolen = c.jar.get('iaml_sid');
    assert.equal((await c.post('/api/auth/logout')).status, 204);
    assert.equal((await c.get('/api/auth/me')).body.user, null);
    // replaying the old cookie no longer works
    const replay = client(ctx.app);
    replay.jar.set('iaml_sid', stolen);
    assert.equal((await replay.get('/api/auth/me')).body.user, null);
    assert.equal((await client(ctx.app).get('/api/auth/me')).status, 200);
  });

  test('only the SHA-256 of the session token is stored; garbage cookies are ignored', async () => {
    const u = await createUser(ctx.db);
    const c = await loginAs(ctx.app, u);
    const token = c.jar.get('iaml_sid');
    const rows = await ctx.db.many('select id from sessions');
    assert.equal(rows.length, 1);
    assert.ok(!rows[0].id.toString('base64url').includes(token));
    const junk = client(ctx.app);
    junk.jar.set('iaml_sid', "x' or 1=1 --");
    assert.equal((await junk.get('/api/auth/me')).body.user, null);
  });

  test('a disabled account loses its sessions immediately', async () => {
    const u = await createUser(ctx.db);
    const c = await loginAs(ctx.app, u);
    await ctx.db.query('update users set disabled_at = now() where id = $1', [u.id]);
    assert.equal((await c.get('/api/auth/me')).body.user, null);
  });
});

describe('password reset', () => {
  test('forgot → code → reset logs in, revokes all other sessions, old password stops working', async () => {
    const u = await createUser(ctx.db, { email: 'reset@example.org' });
    const other = await loginAs(ctx.app, u);

    const c = client(ctx.app);
    assert.equal((await c.post('/api/auth/forgot', { email: 'reset@example.org' })).status, 202);
    const code = await lastCode(ctx.db, 'reset@example.org', 'reset_password');
    assert.match(code, /^\d{6}$/);

    const bad = await c.post('/api/auth/reset', { email: 'reset@example.org', code: '000000', password: 'BrandNewPass1!' });
    assert.equal(bad.status, 400);
    const ok = await c.post('/api/auth/reset', { email: 'reset@example.org', code, password: 'BrandNewPass1!' });
    assert.equal(ok.status, 200);
    assert.equal((await c.get('/api/auth/me')).body.user.email, 'reset@example.org');
    assert.equal((await other.get('/api/auth/me')).body.user, null, 'other sessions revoked');
    assert.equal((await client(ctx.app).post('/api/auth/login', { email: 'reset@example.org', password: PASSWORD })).status, 401);
    assert.equal((await client(ctx.app).post('/api/auth/login', { email: 'reset@example.org', password: 'BrandNewPass1!' })).status, 200);
    // the verify_email purpose cannot be used to reset, and vice versa
    const reused = await client(ctx.app).post('/api/auth/reset', { email: 'reset@example.org', code, password: 'AnotherPass22!' });
    assert.equal(reused.status, 400);
  });

  test('forgot never reveals whether an account exists', async () => {
    await createUser(ctx.db, { email: 'real@example.org' });
    const a = await client(ctx.app).post('/api/auth/forgot', { email: 'real@example.org' });
    const b = await client(ctx.app).post('/api/auth/forgot', { email: 'ghost@example.org' });
    assert.equal(a.status, 202);
    assert.deepEqual(a.body, b.body);
    assert.equal((await mailTo(ctx.db, 'ghost@example.org')).length, 0);
    // unverified accounts cannot reset (they must confirm first)
    await createUser(ctx.db, { email: 'pending@example.org', verified: false });
    await client(ctx.app).post('/api/auth/forgot', { email: 'pending@example.org' });
    assert.equal((await mailTo(ctx.db, 'pending@example.org', 'reset_password')).length, 0);
  });

  test('reset throttles wrong guesses per e-mail', async () => {
    await createUser(ctx.db, { email: 'brute@example.org' });
    await client(ctx.app).post('/api/auth/forgot', { email: 'brute@example.org' });
    let last;
    for (let i = 0; i < 10; i++) {
      last = await client(ctx.app).post('/api/auth/reset', { email: 'brute@example.org', code: '000001', password: 'BrandNewPass1!' });
    }
    assert.equal(last.status, 429);
  });
});

describe('CSRF and request hygiene', () => {
  test('state-changing requests need X-Requested-With', async () => {
    const c = client(ctx.app);
    const r = await c.post('/api/auth/logout', undefined, { headers: { 'x-requested-with': null } });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, 'csrf');
    // GETs do not
    assert.equal((await c.get('/api/auth/me', { headers: { 'x-requested-with': null } })).status, 200);
  });

  test('foreign Origin / Sec-Fetch-Site are rejected, same origin accepted', async () => {
    const c = client(ctx.app);
    const evil = await c.post('/api/auth/login', { email: 'a@b.org', password: 'x' }, { headers: { origin: 'https://evil.example' } });
    assert.equal(evil.body.error.code, 'csrf');
    const cross = await c.post('/api/auth/login', { email: 'a@b.org', password: 'x' }, { headers: { 'sec-fetch-site': 'cross-site' } });
    assert.equal(cross.body.error.code, 'csrf');
    const same = await c.post('/api/auth/login', { email: 'a@b.org', password: 'x' }, { headers: { origin: 'http://localhost:3000', 'sec-fetch-site': 'same-origin' } });
    assert.equal(same.status, 401);
  });

  test('malformed JSON → 400 validation_error, never a 500; empty body is fine', async () => {
    const c = client(ctx.app);
    const bad = await c.request('POST', '/api/auth/login', { body: '{"email": ', headers: { 'content-type': 'application/json' } });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, 'validation_error');
    const empty = await c.request('POST', '/api/auth/logout', { headers: { 'content-type': 'application/json' } });
    assert.equal(empty.status, 204);
    const plain = await c.post('/api/auth/login', '{"email":"a"}', { headers: { 'content-type': 'text/plain' } });
    assert.equal(plain.status, 400);
    assert.equal(plain.body.error.code, 'validation_error');
    const xml = await c.post('/api/auth/login', '<a/>', { headers: { 'content-type': 'application/xml' } });
    assert.equal(xml.status, 415);
    assert.equal(xml.body.error.code, 'unsupported_media_type');
  });

  test('prototype-pollution keys in JSON are ignored', async () => {
    const c = client(ctx.app);
    const r = await c.request('POST', '/api/auth/login', {
      body: '{"email":"a@b.org","password":"x","__proto__":{"polluted":true},"constructor":{"x":1}}',
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(r.status, 401);
    assert.equal({}.polluted, undefined);
  });

  test('security headers on API and HTML', async () => {
    const c = client(ctx.app);
    const api = await c.get('/api/health');
    assert.equal(api.headers['cache-control'], 'no-store');
    assert.equal(api.headers['x-content-type-options'], 'nosniff');
    assert.equal(api.headers['x-frame-options'], 'DENY');
    const html = await c.get('/index.html');
    assert.equal(html.status, 200);
    assert.match(html.headers['content-security-policy'], /script-src 'self'/);
    assert.match(html.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.equal(html.headers['strict-transport-security'], undefined, 'no HSTS over plain http');
  });
});

describe('session hygiene', () => {
  test('logging in again from the same browser replaces its previous session', async () => {
    const u = await createUser(ctx.db);
    const c = await loginAs(ctx.app, u);
    const first = c.jar.get('iaml_sid');
    assert.equal((await ctx.db.one('select count(*)::int as n from sessions')).n, 1);
    const again = await c.post('/api/auth/login', { email: u.email, password: PASSWORD });
    assert.equal(again.status, 200);
    assert.notEqual(c.jar.get('iaml_sid'), first);
    assert.equal((await ctx.db.one('select count(*)::int as n from sessions')).n, 1);
    const old = client(ctx.app);
    old.jar.set('iaml_sid', first);
    assert.equal((await old.get('/api/auth/me')).body.user, null);
  });
});
