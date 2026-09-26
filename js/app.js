/* HEMA Space Passport — kiosk flow. */
(function (H) {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // Kurdish and Persian keyboards type ٠-٩ / ۰-۹; normalise them to 0-9.
  const toLatinDigits = (s) => String(s).replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x660).replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x6f0);
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  // Kiosk mode (open the site once with ?kiosk on the festival screen; the device remembers it, ?kiosk=off undoes it).
  // Only kiosks go back to the welcome screen after inactivity: on a visitor's own phone that would lose their passport.
  const KIOSK = (() => {
    const q = new URLSearchParams(location.search).get('kiosk');
    try {
      if (q === 'off' || q === '0') localStorage.removeItem('hema-kiosk');
      else if (q !== null) localStorage.setItem('hema-kiosk', '1');
      return localStorage.getItem('hema-kiosk') === '1';
    } catch (e) { return q !== null && q !== 'off' && q !== '0'; }
  })();
  const newClientId = () => (crypto.randomUUID ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''));
  const openDialog = (d) => { if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', ''); };
  const closeDialog = (d) => { if (typeof d.close === 'function') { if (d.open) d.close(); } else d.removeAttribute('open'); };

  const state = { photo: null, photoUrl: null, passport: null, busy: false, logos: { hema: null, kaf: null } };

  /* ---------- screens ---------- */
  function current() { const s = $('.screen.is-active'); return s ? s.id.replace('screen-', '') : ''; }
  // The phone's Back button (or iPhone swipe back) steps back one screen instead of leaving the site.
  let inFlow = false; // true while an extra history entry catches the Back button
  function show(name) {
    if (name !== 'welcome' && !inFlow) { history.pushState({ hemaFlow: true }, ''); inFlow = true; }
    if (name === 'welcome' && inFlow) { inFlow = false; history.back(); }
    $$('.screen').forEach((s) => s.classList.toggle('is-active', s.id === 'screen-' + name));
    window.scrollTo(0, 0);
    const focusTarget = $('#screen-' + name + ' h1, #screen-' + name + ' h2');
    if (focusTarget) { focusTarget.setAttribute('tabindex', '-1'); focusTarget.focus({ preventScroll: true }); }
  }

  /* ---------- logos ---------- */
  async function loadLogos() {
    const [hema, kaf] = await Promise.all([H.loadImage(H.CONFIG.LOGO_HEMA), H.loadImage(H.CONFIG.LOGO_FESTIVAL)]);
    state.logos = { hema, kaf };
    if (kaf) { const m = $('[data-logo="kaf"]'); m.innerHTML = ''; const img = kaf.cloneNode(); img.alt = ''; m.append(img); m.hidden = false; }
    renderSpecimen();
  }

  // Sample passport on the welcome screen, so visitors see what they will receive.
  function renderSpecimen() {
    H.renderPassport($('#specimen-canvas'), {
      name: 'Your Name', age: '', origin: 'Erbil, Kurdistan', callsign: 'NOVA',
      dest: 1, role: 0, mission: 4, serial: '000000', issued: H.todayISO(),
    }, { logos: state.logos, specimen: true });
  }

  /* ---------- options ---------- */
  function buildOptions() {
    const dest = $('#dest-options');
    H.DESTINATIONS.forEach((d, i) => {
      const el = document.createElement('label');
      el.className = 'opt dest';
      el.innerHTML = `<input type="radio" name="dest" value="${i}"><span class="opt-body"><canvas width="208" height="208" aria-hidden="true"></canvas><strong></strong><small></small></span>`;
      $('strong', el).textContent = d.label;
      $('small', el).textContent = d.meta;
      H.drawPlanet($('canvas', el).getContext('2d'), d.id, 104, 104, H.planetIconRadius(d.id, 208), 3 + i);
      dest.append(el);
    });
    const chip = (list, name, root) => list.forEach((o, i) => {
      const el = document.createElement('label');
      el.className = 'opt chip';
      el.innerHTML = `<input type="radio" name="${name}" value="${i}"><span class="opt-body"></span>`;
      $('.opt-body', el).textContent = o.label;
      root.append(el);
    });
    chip(H.ROLES, 'role', $('#role-options'));
    chip(H.MISSIONS, 'mission', $('#mission-options'));
  }

  const radio = (name) => { const r = $(`input[name="${name}"]:checked`); return r ? Number(r.value) : null; };
  const val = (sel) => $(sel).value.trim().replace(/\s+/g, ' ');

  /* ---------- validation ---------- */
  function readAge() {
    const raw = toLatinDigits($('#f-age').value).trim();
    return /^\d{1,3}$/.test(raw) ? Number(raw) : NaN;
  }

  function validatePersonal() {
    const age = readAge();
    const checks = [
      ['#f-first', val('#f-first').length > 0],
      ['#f-second', val('#f-second').length > 0],
      ['#f-age', age >= 1 && age <= 120],
      ['#f-origin', val('#f-origin').length > 0],
    ];
    let firstBad = null;
    checks.forEach(([sel, ok]) => {
      $(sel).closest('.field').classList.toggle('invalid', !ok);
      if (!ok && !firstBad) firstBad = $(sel);
    });
    if (firstBad) firstBad.focus();
    return !firstBad;
  }

  function validateIdentity() {
    const cs = H.cleanCallsign($('#f-callsign').value);
    const checks = [['#group-dest', radio('dest') !== null], ['#group-role', radio('role') !== null],
      ['#group-mission', radio('mission') !== null], ['#group-callsign', /[\p{L}\p{N}]/u.test(cs)]];
    let firstBad = null;
    checks.forEach(([sel, ok]) => {
      $(sel).classList.toggle('invalid', !ok);
      if (!ok && !firstBad) firstBad = $(sel);
    });
    if (firstBad) firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return !firstBad;
  }

  /* ---------- photo ---------- */
  // Normalise any photo to a 600×800 portrait so the passport and the download stay light.
  function setPhoto(img) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    const c = document.createElement('canvas');
    c.width = 600; c.height = 800;
    const g = c.getContext('2d');
    const s = Math.max(600 / iw, 800 / ih), sw = 600 / s, sh = 800 / s;
    g.drawImage(img, (iw - sw) / 2, Math.max(0, (ih - sh) * 0.3), sw, sh, 0, 0, 600, 800);
    state.photo = c;
    c.toBlob((blob) => {
      if (!blob || state.photo !== c) return; // reset while encoding
      if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
      state.photoUrl = URL.createObjectURL(blob);
      const prev = $('#photo-preview');
      prev.src = state.photoUrl; prev.hidden = false;
      $('#photo-empty').hidden = true;
      $('#photo-upload-label').textContent = 'Change photo';
    }, 'image/jpeg', 0.9);
  }

  function onFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { setPhoto(img); URL.revokeObjectURL(url); };
    img.onerror = () => { URL.revokeObjectURL(url); alert('That image could not be opened. Please try another photo.'); };
    img.src = url;
  }

  // Small JPEGs of the photo for the admin database: 360×480 (about 40 KB) and a 96×128 thumbnail.
  function photoJpeg(w, h, quality) {
    if (!state.photo) return null;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(state.photo, 0, 0, w, h);
    return c.toDataURL('image/jpeg', quality);
  }

  /* ---------- saving to the admin database ----------
     Each passport is sent to the database (js/db.js), which gives out a unique number.
     If it can't be reached (venue internet down, or the database is not set up yet), the kiosk issues
     a local number and keeps the record in a queue that is sent automatically once the connection is back. */
  const QUEUE_KEY = 'hema-pending';

  function readQueue() { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch (e) { return []; } }
  function writeQueue(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }
    catch (e) { // storage full: keep the data, drop the photos
      try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q.map((r) => ({ ...r, photo: null, thumb: null })))); } catch (e2) { /* give up */ }
    }
  }

  async function savePassport(record) {
    const saved = await H.db.issuePassport(record, 8000);
    if (saved && saved.serial) return saved;
    const offline = { ...record, serial: H.newPassportNumber(), issued: H.todayISO(), createdAt: new Date().toISOString() };
    if (!(saved && saved.rejected)) writeQueue([...readQueue(), offline]);
    return { serial: offline.serial, issued: offline.issued };
  }

  let flushing = false;
  async function flushQueue() {
    if (flushing || !H.db.configured) return;
    const queue = readQueue();
    if (!queue.length) return;
    flushing = true;
    const left = [];
    for (const rec of queue) {
      const r = await H.db.issuePassport(rec, 15000);
      if (!r) left.push(rec); // still offline; rejected records are dropped
    }
    // keep anything queued while we were sending
    const added = readQueue().slice(queue.length);
    writeQueue([...left, ...added]);
    flushing = false;
  }

  /* ---------- callsign ---------- */
  function generateCallsign() {
    const input = $('#f-callsign');
    input.value = H.generateCallsign(input.value);
    input.classList.remove('pulse'); void input.offsetWidth; input.classList.add('pulse');
    $('#group-callsign').classList.remove('invalid');
  }

  /* ---------- generate ---------- */
  async function generate() {
    if (state.busy || !validateIdentity()) return;
    state.busy = true;
    try {
      const first = val('#f-first'), second = val('#f-second'), third = val('#f-third');
      const p = {
        first, second, third,
        name: [first, second, third].filter(Boolean).join(' '),
        age: readAge(),
        origin: val('#f-origin'),
        callsign: H.cleanCallsign($('#f-callsign').value),
        dest: radio('dest'), role: radio('role'), mission: radio('mission'),
      };
      state.passport = p;
      const saving = savePassport({
        clientId: newClientId(),
        first, second, third, age: p.age, origin: p.origin, callsign: p.callsign,
        dest: p.dest, role: p.role, mission: p.mission,
        photo: photoJpeg(360, 480, 0.82), thumb: photoJpeg(96, 128, 0.7),
      });

      show('generating');
      const log = $('#gen-log'), bar = $('#gen-bar');
      log.innerHTML = ''; bar.style.width = '0%';
      const steps = [
        () => 'Verifying traveller identity',
        () => 'Plotting trajectory to ' + H.DESTINATIONS[p.dest].label,
        () => 'Assigning mission class',
        () => 'Encoding passport ' + H.CONFIG.NUMBER_PREFIX + p.serial,
        () => 'Applying security features',
      ];
      let rendering = null;
      for (let i = 0; i < steps.length; i++) {
        if (i === 3) { // the number comes from the server
          const saved = await saving;
          p.serial = saved.serial; p.issued = saved.issued;
          rendering = H.renderPassport($('#passport-canvas'), p, { photo: state.photo, logos: state.logos });
        }
        const li = document.createElement('li');
        const text = document.createElement('span'), status = document.createElement('b');
        text.textContent = steps[i]();
        li.append(text, status);
        log.append(li);
        await wait(520);
        li.classList.add('done'); status.textContent = 'Done';
        bar.style.width = ((i + 1) / steps.length) * 100 + '%';
      }
      await rendering;
      await wait(350);
      if (state.passport !== p) return; // reset while generating
      $('#issued-callsign').textContent = p.callsign;
      show('issued');
    } finally {
      state.busy = false;
    }
  }

  /* ---------- download / share ---------- */
  function passportBlob() { return new Promise((r) => $('#passport-canvas').toBlob(r, 'image/png')); }

  async function download() {
    if (!state.passport) return;
    const blob = await passportBlob();
    if (!blob) return;
    const name = `HEMA-Space-Passport-${H.CONFIG.NUMBER_PREFIX}${state.passport.serial}.png`;
    // Phones: the share sheet offers "Save image" straight to the photo gallery.
    if (isTouch && navigator.canShare) {
      const file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'My HEMA Space Passport' }); return; }
        catch (e) { if (e.name === 'AbortError') return; }
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  /* ---------- full-screen passport viewer ---------- */
  let viewerUrl = null;
  async function openViewer() {
    if (!state.passport) return;
    const blob = await passportBlob();
    if (!blob) return;
    if (viewerUrl) URL.revokeObjectURL(viewerUrl);
    viewerUrl = URL.createObjectURL(blob);
    $('#viewer-img').src = viewerUrl;
    openDialog($('#viewer'));
  }
  function closeViewer() { closeDialog($('#viewer')); }

  function reset() {
    closeViewer();
    $$('form').forEach((f) => f.reset());
    $$('.invalid').forEach((el) => el.classList.remove('invalid'));
    if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
    state.photo = null; state.photoUrl = null; state.passport = null;
    const prev = $('#photo-preview'); prev.hidden = true; prev.removeAttribute('src');
    $('#photo-empty').hidden = false;
    $('#photo-upload-label').textContent = 'Upload photo';
    const cv = $('#passport-canvas'); cv.width = cv.width; // clear
    show('welcome');
  }

  /* ---------- idle reset (kiosk) ---------- */
  let lastActivity = Date.now();
  ['pointerdown', 'keydown', 'input', 'scroll'].forEach((ev) => window.addEventListener(ev, () => { lastActivity = Date.now(); }, { passive: true, capture: true }));
  setInterval(() => {
    const limit = H.CONFIG.IDLE_RESET_SECONDS * 1000;
    if (!KIOSK || !limit || state.busy || current() === 'welcome') return;
    if (Date.now() - lastActivity > limit) reset();
  }, 5000);

  /* ---------- wiring ---------- */
  const actions = {
    home: (e) => { e.preventDefault(); reset(); },
    start: () => show('personal'),
    'to-identity': () => { if (validatePersonal()) show('identity'); },
    'to-personal': () => show('personal'),
    'gen-callsign': generateCallsign,
    generate,
    download,
    view: openViewer,
    'close-viewer': closeViewer,
    restart: reset,
  };
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action]');
    if (t && actions[t.dataset.action]) actions[t.dataset.action](e);
  });
  $('#photo-upload').addEventListener('change', onFile);
  $('#form-personal').addEventListener('submit', (e) => { e.preventDefault(); actions['to-identity'](); });
  $('#form-identity').addEventListener('submit', (e) => { e.preventDefault(); generate(); });
  // Enter moves to the next field, and continues from the last one (these forms have no submit button).
  $('#form-personal').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing || e.target.tagName !== 'INPUT' || e.target.type === 'file') return;
    e.preventDefault();
    const order = ['#f-first', '#f-second', '#f-third', '#f-age', '#f-origin'];
    const i = order.findIndex((sel) => $(sel) === e.target);
    if (i >= 0 && i < order.length - 1) $(order[i + 1]).focus();
    else actions['to-identity']();
  });
  $('#f-callsign').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); generate(); } });
  $('#form-personal').addEventListener('input', (e) => { const f = e.target.closest('.field'); if (f) f.classList.remove('invalid'); });
  $('#form-identity').addEventListener('change', (e) => {
    const b = e.target.closest('.block'); if (b) b.classList.remove('invalid');
  });
  $('#f-callsign').addEventListener('input', (e) => {
    $('#group-callsign').classList.remove('invalid');
    if (e.isComposing) return; // don't disturb an input method mid-word
    const upper = e.target.value.toUpperCase();
    if (upper === e.target.value) return;
    const pos = e.target.selectionStart;
    e.target.value = upper;
    try { e.target.setSelectionRange(pos, pos); } catch (err) { /* ignore */ }
  });
  window.addEventListener('popstate', () => {
    if (!inFlow) return; // our own history.back() after returning to the welcome screen
    inFlow = false;
    const screen = current();
    if ($('#viewer').open || $('#viewer').hasAttribute('open')) { closeViewer(); show(screen); return; } // Back closes the big passport first
    if (screen === 'generating') { show('generating'); return; } // can't step back while the passport is being made
    if (screen === 'identity') show('personal');
    else if (screen === 'issued') reset();
    else show('welcome');
  });
  $('#viewer').addEventListener('click', (e) => { if (e.target === e.currentTarget || e.target.id === 'viewer-img') closeViewer(); });

  buildOptions();
  loadLogos();
  flushQueue();
  setInterval(flushQueue, 30000);
  window.addEventListener('online', flushQueue);
})(window.HEMA);
