/* HEMA Space Passport — admin dashboard (reads the Supabase database through js/db.js). */
(function (H) {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const db = H.db;
  const REFRESH_MS = 10000;
  const FULL_RELOAD_MS = 5 * 60 * 1000; // also picks up passports deleted on another device
  const OVERLAP = 200;                   // re-check the newest ids: an earlier id can finish saving after a later one
  const state = { rows: [], maxId: 0, first: true, timer: null, query: '', open: null, logos: null, loading: false, lastFull: 0, deleted: new Set() };
  // <dialog> needs iOS 15.4+; older browsers get the same window via the open attribute.
  const openDialog = (d) => { if (typeof d.showModal === 'function') d.showModal(); else { d.classList.add('is-fallback'); d.setAttribute('open', ''); } };
  const closeDialog = (d) => {
    if (typeof d.close === 'function') { if (d.open) d.close(); }
    else { d.removeAttribute('open'); d.dispatchEvent(new Event('close')); }
  };

  /* ---------- screens ---------- */
  function showOnly(id) { ['#login', '#setup', '#dash'].forEach((s) => { $(s).hidden = s !== id; }); }

  function showLogin(message) {
    clearInterval(state.timer);
    showOnly('#login');
    $('#password').value = '';
    $('#login-error').hidden = !message;
    $('#login-error').textContent = message || '';
    ($('#email').value ? $('#password') : $('#email')).focus();
  }

  async function showDash() {
    showOnly('#dash');
    $('#who').textContent = db.currentEmail() || 'Passport admin';
    state.rows = []; state.maxId = 0; state.first = true; state.lastFull = 0; state.deleted = new Set();
    try {
      $('#not-admin').hidden = await db.isAdmin();
    } catch (e) { if (e instanceof db.SignedOut) return showLogin(); }
    await load();
    clearInterval(state.timer);
    state.timer = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
  }

  function handle(err) {
    if (err instanceof db.SignedOut) { showLogin('Your session ended. Please sign in again.'); return true; }
    return false;
  }

  /* ---------- sign in ---------- */
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#login-form button[type="submit"]');
    btn.disabled = true;
    $('#login-error').hidden = true;
    try {
      const r = await db.signIn($('#email').value.trim(), $('#password').value);
      if (r.error) { $('#login-error').textContent = r.error; $('#login-error').hidden = false; $('#password').select(); }
      else showDash();
    } catch (err) {
      $('#login-error').textContent = 'Could not reach the database. Check the internet connection.';
      $('#login-error').hidden = false;
    } finally { btn.disabled = false; }
  });

  $('#logout').addEventListener('click', async () => {
    await db.signOut();
    state.rows = [];
    showLogin();
  });

  /* ---------- data ---------- */
  const fullName = (r) => [r.first, r.second, r.third].filter(Boolean).join(' ');
  const dateTime = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  const todayErbil = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10); // Erbil is UTC+3 all year

  // Loads everything at first and every 5 minutes; in between, only the newest passports (with some overlap).
  async function load() {
    if (state.loading) return;
    state.loading = true;
    try {
      const full = !state.maxId || Date.now() - state.lastFull > FULL_RELOAD_MS;
      if (full) {
        const all = (await db.listPassports(0)).filter((r) => !state.deleted.has(r.id));
        const known = new Set(state.rows.map((r) => r.id));
        const newIds = state.first ? [] : all.filter((r) => !known.has(r.id)).map((r) => r.id);
        const changed = state.first || newIds.length > 0 || all.length !== state.rows.length;
        state.rows = all;
        state.lastFull = Date.now();
        state.maxId = all.reduce((m, r) => Math.max(m, r.id), 0);
        setLive(true);
        if (changed) render(newIds);
      } else {
        // cheap check first (ids only); full rows only for passports we don't have yet
        const known = new Set(state.rows.map((r) => r.id));
        const missing = (await db.recentIds(Math.max(0, state.maxId - OVERLAP))).filter((id) => !known.has(id) && !state.deleted.has(id));
        const fresh = missing.length ? (await db.getRows(missing)).filter((r) => !known.has(r.id)) : [];
        setLive(true);
        if (fresh.length) {
          state.rows = [...fresh, ...state.rows].sort((a, b) => b.id - a.id);
          state.maxId = Math.max(state.maxId, ...fresh.map((r) => r.id));
          render(fresh.map((r) => r.id));
        }
      }
    } catch (e) {
      if (!handle(e)) setLive(false);
    } finally {
      state.loading = false;
    }
  }

  function setLive(on) {
    $('#live').classList.toggle('is-off', !on);
    $('#live').textContent = on ? 'Live' : 'Offline';
  }

  function render(newIds) {
    const rows = state.rows;
    const total = rows.length;
    const withAge = rows.filter((r) => r.age);
    $('#s-total').textContent = total.toLocaleString();
    $('#s-today').textContent = rows.filter((r) => r.issued === todayErbil()).length.toLocaleString();
    $('#s-photo').textContent = rows.filter((r) => r.thumb).length.toLocaleString();
    $('#s-age').textContent = withAge.length ? (withAge.reduce((s, r) => s + r.age, 0) / withAge.length).toFixed(1).replace(/\.0$/, '') : '–';
    bars($('#b-dest'), H.DESTINATIONS.map((d) => d.label), rows.map((r) => r.dest), total);
    bars($('#b-role'), H.ROLES.map((r) => r.label), rows.map((r) => r.role), total);
    renderRows(new Set(state.first ? [] : newIds));
    state.first = false;
  }

  // Horizontal bar list, sorted by count. Single series, so one hue and the numbers written beside each bar.
  function bars(ul, labels, values, total) {
    const counts = labels.map(() => 0);
    values.forEach((v) => { if (counts[v] != null) counts[v]++; });
    const items = labels.map((label, i) => ({ label, n: counts[i] })).sort((a, b) => b.n - a.n);
    const max = Math.max(1, ...items.map((i) => i.n));
    ul.replaceChildren(...items.map((it) => {
      const li = document.createElement('li');
      const pct = total ? Math.round((it.n / total) * 100) : 0;
      li.title = `${it.label}: ${it.n} (${pct}%)`;
      li.innerHTML = '<span class="bar-label"></span><span class="bar-track"><i></i></span><span class="bar-value"></span>';
      li.querySelector('.bar-label').textContent = it.label;
      li.querySelector('i').style.width = (it.n / max) * 100 + '%';
      li.querySelector('.bar-value').textContent = it.n;
      return li;
    }));
  }

  function matches(r, q) {
    if (!q) return true;
    const hay = [fullName(r), r.serial, H.CONFIG.NUMBER_PREFIX + r.serial, r.callsign, r.origin].join(' ').toLowerCase();
    return hay.includes(q.toLowerCase());
  }

  function renderRows(newIds) {
    const shown = state.rows.filter((r) => matches(r, state.query));
    const frag = document.createDocumentFragment();
    for (const r of shown) {
      const tr = document.createElement('tr');
      tr.tabIndex = 0;
      tr.dataset.id = r.id;
      if (newIds.has(r.id)) tr.classList.add('is-new');
      const cells = [
        ['photo', ''],
        ['number', H.CONFIG.NUMBER_PREFIX + r.serial],
        ['name', fullName(r)],
        ['age', r.age],
        ['origin', r.origin],
        ['callsign', r.callsign],
        ['dest', (H.DESTINATIONS[r.dest] || {}).label || ''],
        ['role', (H.ROLES[r.role] || {}).label || ''],
        ['issued', dateTime(r.createdAt)],
      ];
      for (const [k, v] of cells) {
        const td = document.createElement('td');
        td.className = 'c-' + k;
        if (k === 'photo') {
          if (r.thumb && r.thumb.startsWith('data:image/jpeg;base64,')) {
            const img = document.createElement('img');
            img.alt = ''; img.src = r.thumb;
            td.append(img);
          } else {
            td.innerHTML = '<span class="no-photo"><svg class="ico" aria-hidden="true"><use href="#i-user"/></svg></span>';
          }
        } else {
          td.textContent = v;
          td.dataset.label = { dest: 'Destination' }[k] || '';
        }
        tr.append(td);
      }
      frag.append(tr);
    }
    $('#rows').replaceChildren(frag);
    const total = state.rows.length;
    $('#count').textContent = state.query ? `${shown.length} of ${total}` : String(total);
    $('#empty').hidden = shown.length > 0;
    $('#empty').textContent = state.query ? 'No passports match your search.' : 'No passports yet. They appear here as soon as visitors create them.';
  }

  $('#search').addEventListener('input', (e) => { state.query = e.target.value.trim(); renderRows(new Set()); });

  /* ---------- CSV export (made in the browser from the loaded list) ---------- */
  function csvCell(v) {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheets from running formulas
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  $('#export').addEventListener('click', () => {
    const head = ['Passport number', 'First name', 'Second name', 'Third name', 'Age', 'City / Country', 'Callsign',
      'Destination', 'Mission role', 'Mission', 'Mission class', 'Date of issue', 'Created at', 'Photo', 'Saved'];
    const lines = [head.map(csvCell).join(',')];
    for (const r of state.rows) {
      lines.push([H.CONFIG.NUMBER_PREFIX + r.serial, r.first, r.second, r.third, r.age, r.origin, r.callsign,
        (H.DESTINATIONS[r.dest] || {}).label, (H.ROLES[r.role] || {}).label, (H.MISSIONS[r.mission] || {}).label,
        H.missionClass(r.dest, r.role), r.issued, new Date(r.createdAt).toLocaleString(), r.thumb ? 'yes' : 'no',
        r.offline ? 'later (offline)' : 'instantly'].map(csvCell).join(','));
    }
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `hema-passports-${todayErbil()}.csv`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });

  /* ---------- PDF register (every passport with its photo) ---------- */
  $('#pdf').addEventListener('click', async () => {
    const btn = $('#pdf'), label = $('#pdf-label');
    if (btn.disabled) return;
    if (!state.rows.length) { alert('There are no passports to download yet.'); return; }
    btn.disabled = true;
    const setLabel = (t) => { label.textContent = t; btn.title = t; };
    try {
      const rows = [...state.rows].sort((a, b) => a.id - b.id); // oldest first, like a register
      setLabel('Loading photos');
      const withPhoto = rows.filter((r) => r.thumb).map((r) => r.id);
      const photos = await db.getPhotos(withPhoto, (done, total) => setLabel(`Photos ${Math.round((done / total) * 100)}%`));
      if (!state.logos) {
        const [hema, kaf] = await Promise.all([H.loadImage('../' + H.CONFIG.LOGO_HEMA), H.loadImage('../' + H.CONFIG.LOGO_FESTIVAL)]);
        state.logos = { hema, kaf };
      }
      setLabel('Making PDF 0%');
      const blob = await H.buildPassportPdf(rows, photos, {
        logo: state.logos.hema, by: db.currentEmail(),
        onProgress: (f) => setLabel(`Making PDF ${Math.round(f * 100)}%`),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `HEMA-Passport-Register-${todayErbil()}.pdf`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      if (!handle(e)) alert('Could not make the PDF: ' + e.message);
    } finally {
      btn.disabled = false;
      setLabel('Download PDF');
      btn.title = 'Download every passport with photos as a PDF';
    }
  });

  /* ---------- detail ---------- */
  async function openDetail(id) {
    const r = state.rows.find((x) => x.id === id);
    if (!r) return;
    state.open = r;
    $('#d-number').textContent = H.CONFIG.NUMBER_PREFIX + r.serial;
    $('#d-name').textContent = fullName(r);
    const fields = [
      ['First name', r.first], ['Second name', r.second], ['Third name', r.third || '—'],
      ['Age', r.age], ['City / Country', r.origin], ['Callsign', r.callsign],
      ['Destination', (H.DESTINATIONS[r.dest] || {}).label], ['Mission role', (H.ROLES[r.role] || {}).label],
      ['Mission', (H.MISSIONS[r.mission] || {}).label], ['Mission class', H.missionClass(r.dest, r.role)],
      ['Created', new Date(r.createdAt).toLocaleString()], ['Saved', r.offline ? 'Later (kiosk was offline)' : 'Instantly'],
    ];
    $('#d-fields').replaceChildren(...fields.map(([k, v]) => {
      const wrap = document.createElement('div');
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v == null ? '' : v;
      wrap.append(dt, dd);
      return wrap;
    }));
    const canvas = $('#d-passport');
    canvas.width = canvas.width; // clear the previous passport
    openDialog($('#detail'));
    if (!state.logos) {
      const [hema, kaf] = await Promise.all([H.loadImage('../' + H.CONFIG.LOGO_HEMA), H.loadImage('../' + H.CONFIG.LOGO_FESTIVAL)]);
      state.logos = { hema, kaf };
    }
    let photo = null;
    if (r.thumb) {
      try {
        const src = await db.getPhoto(r.id);
        if (src && src.startsWith('data:image/jpeg;base64,')) photo = await H.loadImage(src);
      } catch (e) { if (handle(e)) return; }
    }
    if (state.open !== r) return;
    await H.renderPassport(canvas, {
      name: fullName(r), age: r.age, origin: r.origin, callsign: r.callsign,
      dest: r.dest, role: r.role, mission: r.mission, serial: r.serial, issued: r.issued,
    }, { photo, logos: state.logos });
  }

  $('#rows').addEventListener('click', (e) => { const tr = e.target.closest('tr'); if (tr) openDetail(Number(tr.dataset.id)); });
  $('#rows').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const tr = e.target.closest('tr'); if (!tr) return;
    e.preventDefault(); openDetail(Number(tr.dataset.id));
  });
  $('#detail').addEventListener('click', (e) => { if (e.target === e.currentTarget || e.target.closest('[data-close]')) closeDialog($('#detail')); });
  $('#detail').addEventListener('close', () => { state.open = null; });

  $('#d-download').addEventListener('click', () => {
    const r = state.open; if (!r) return;
    $('#d-passport').toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `HEMA-Space-Passport-${H.CONFIG.NUMBER_PREFIX}${r.serial}.png`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }, 'image/png');
  });

  $('#d-delete').addEventListener('click', async () => {
    const r = state.open; if (!r) return;
    if (!confirm(`Delete passport ${H.CONFIG.NUMBER_PREFIX}${r.serial} for ${fullName(r)}?\nThis cannot be undone.`)) return;
    try {
      await db.deletePassport(r.id);
      state.deleted.add(r.id); // so a refresh that was already on its way can't bring it back
      state.rows = state.rows.filter((x) => x.id !== r.id);
      closeDialog($('#detail'));
      render([]);
    } catch (e) { if (!handle(e)) alert('Could not delete: ' + e.message); }
  });

  /* ---------- start ---------- */
  if (!db.configured) showOnly('#setup');
  else if (db.currentEmail()) showDash();
  else showLogin();
})(window.HEMA);
