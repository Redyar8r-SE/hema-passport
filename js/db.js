/* HEMA Space Passport — database client (Supabase REST, no library needed).
   Visitors: issuePassport() only. Admin: signIn / list / photo / delete, allowed by the rules in supabase/setup.sql. */
window.HEMA = window.HEMA || {};

(function (H) {
  'use strict';

  const cfg = H.SUPABASE || {};
  const base = String(cfg.url || '').replace(/\/+$/, '');
  const key = String(cfg.key || '');
  const SESSION_KEY = 'hema-admin-session';

  const db = { configured: !!(base && key) };
  // Set when the database still has the older issue_passport() without duplicate protection.
  let legacyIssue = false;

  async function request(path, { method = 'GET', body, token, headers = {}, timeout = 15000 } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(base + path, {
        method,
        signal: ctrl.signal,
        headers: {
          apikey: key,
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
      return { ok: res.ok, status: res.status, data, headers: res.headers };
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------- visitors ---------- */
  // Resolves to { serial, issued }, { rejected: true } (bad data, never retry) or null (offline / server trouble, retry later).
  db.issuePassport = async function (rec, timeout) {
    if (!db.configured) return null;
    try {
      const body = {
        p_first: rec.first, p_second: rec.second, p_third: rec.third || '', p_age: rec.age,
        p_origin: rec.origin, p_callsign: rec.callsign,
        p_destination: rec.dest, p_role: rec.role, p_mission: rec.mission,
        p_photo: rec.photo || null, p_photo_thumb: rec.thumb || null,
        p_serial: rec.serial || null, p_issued: rec.issued || null, p_created: rec.createdAt || null,
      };
      if (rec.clientId && !legacyIssue) body.p_client_id = rec.clientId;
      const send = () => request('/rest/v1/rpc/issue_passport', { method: 'POST', timeout: timeout || 8000, body });
      let r = await send();
      // Older database script (before duplicate protection): it doesn't know p_client_id yet, so send without it.
      if (r.status === 404 && body.p_client_id) {
        legacyIssue = true;
        delete body.p_client_id;
        r = await send();
      }
      if (r.ok && r.data && r.data.serial) return r.data;
      if (r.status === 400) return { rejected: true };
      return null;
    } catch (e) {
      return null;
    }
  };

  /* ---------- admin session ---------- */
  function saveSession(s) { try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }
  function loadSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; } }
  function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } }
  function fromAuth(d) {
    return { access: d.access_token, refresh: d.refresh_token, expires: Date.now() + (d.expires_in || 3600) * 1000, email: d.user && d.user.email };
  }

  db.signIn = async function (email, password) {
    const r = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
    if (!r.ok) {
      const msg = (r.data && (r.data.error_description || r.data.msg || r.data.message)) || '';
      return { error: r.status === 400 || /invalid/i.test(msg) ? 'Wrong email or password.' : 'Could not sign in (' + r.status + ').' };
    }
    const s = fromAuth(r.data);
    saveSession(s);
    return { email: s.email };
  };

  // A valid access token, refreshed when it is about to expire. null = signed out.
  async function token() {
    let s = loadSession();
    if (!s) return null;
    if (Date.now() > s.expires - 60000) {
      const r = await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh } });
      if (r.status === 400 || r.status === 401) { clearSession(); return null; } // the login really ended
      if (!r.ok) throw new Error('Could not refresh the session (' + r.status + ')'); // server trouble: stay signed in
      s = fromAuth(r.data);
      saveSession(s);
    }
    return s.access;
  }

  db.currentEmail = function () { const s = loadSession(); return s ? s.email : null; };

  db.signOut = async function () {
    const t = await token().catch(() => null);
    clearSession();
    if (t) await request('/auth/v1/logout', { method: 'POST', token: t }).catch(() => {});
  };

  class SignedOut extends Error {}
  db.SignedOut = SignedOut;

  async function adminRequest(path, opts) {
    const t = await token();
    if (!t) throw new SignedOut('Signed out');
    const r = await request(path, { ...opts, token: t });
    if (r.status === 401) { clearSession(); throw new SignedOut('Signed out'); }
    if (!r.ok) throw new Error((r.data && r.data.message) || 'Request failed (' + r.status + ')');
    return r;
  }

  const LIST_COLUMNS = 'id,serial,first_name,second_name,third_name,age,origin,callsign,destination,role,mission,issued,created_at,offline,photo_thumb';
  const toRow = (x) => ({
    id: x.id, serial: x.serial, first: x.first_name, second: x.second_name, third: x.third_name || '',
    age: x.age, origin: x.origin, callsign: x.callsign, dest: x.destination, role: x.role, mission: x.mission,
    issued: x.issued, createdAt: x.created_at, offline: x.offline, thumb: x.photo_thumb || null,
  });

  // All passports newer than afterId (0 = everything), newest first.
  db.listPassports = async function (afterId) {
    const rows = [];
    const page = 1000;
    for (let from = 0; ; from += page) {
      const filter = afterId ? `&id=gt.${Number(afterId)}` : '';
      const r = await adminRequest(`/rest/v1/passports?select=${LIST_COLUMNS}${filter}&order=id.desc`, {
        headers: { Range: `${from}-${from + page - 1}`, 'Range-Unit': 'items' },
      });
      const batch = Array.isArray(r.data) ? r.data : [];
      rows.push(...batch.map(toRow));
      if (batch.length < page) break;
    }
    return rows;
  };

  // Can this account see the passports? (Signed in with an email that is not in the admins list → false.)
  db.isAdmin = async function () {
    const r = await adminRequest('/rest/v1/rpc/is_admin', { method: 'POST', body: {} });
    return r.data === true;
  };

  db.getPhoto = async function (id) {
    const r = await adminRequest(`/rest/v1/passports?select=photo&id=eq.${Number(id)}`);
    return (Array.isArray(r.data) && r.data[0] && r.data[0].photo) || null;
  };

  db.deletePassport = async function (id) {
    await adminRequest(`/rest/v1/passports?id=eq.${Number(id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  };

  H.db = db;
})(window.HEMA);
