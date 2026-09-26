/* HEMA Space Passport — shared data, config and helpers. */
window.HEMA = window.HEMA || {};

(function (H) {
  'use strict';

  H.CONFIG = {
    NUMBER_PREFIX: 'HEMA-KAF-2026-',
    EVENT: {
      name: 'Kurdistan Astronomy Festival 2026',
      dates: '25–26 September 2026',
      venue: 'YouthHub, Erbil',
    },

    // Drop the official logo files here (transparent PNG or SVG). If missing, a built-in emblem is used.
    LOGO_HEMA: 'assets/hema-logo.png',
    LOGO_FESTIVAL: 'assets/kaf-logo.png',

    // Kiosk: return to the welcome screen after this many seconds without interaction (0 = never).
    IDLE_RESET_SECONDS: 180,
  };

  H.DESTINATIONS = [
    { id: 'moon',    label: 'Moon',           adj: 'LUNAR',      noun: 'EXPEDITION', meta: '384,400 km' },
    { id: 'mars',    label: 'Mars',           adj: 'MARS',       noun: 'EXPEDITION', meta: '225 million km' },
    { id: 'saturn',  label: 'Saturn',         adj: 'SATURN',     noun: 'VOYAGE',     meta: '1.4 billion km' },
    { id: 'station', label: 'Space Station',  adj: 'ORBITAL',    noun: 'PROGRAM',    meta: '≈ 400 km orbit' },
    { id: 'deep',    label: 'Deep Space',     adj: 'DEEP SPACE', noun: 'VOYAGE',     meta: 'Beyond the heliosphere' },
    { id: 'unknown', label: 'Unknown Planet', adj: 'EXOPLANET',  noun: 'SURVEY',     meta: 'Coordinates classified' },
  ];

  H.ROLES = [
    { id: 'astronomer',   label: 'Astronomer',          discipline: 'ASTRONOMY' },
    { id: 'astronaut',    label: 'Astronaut',           discipline: 'CREWED FLIGHT' },
    { id: 'engineer',     label: 'Space Engineer',      discipline: 'ENGINEERING' },
    { id: 'scientist',    label: 'Scientist',           discipline: 'SCIENCE' },
    { id: 'pilot',        label: 'Pilot',               discipline: 'FLIGHT COMMAND' },
    { id: 'planetary',    label: 'Planetary Scientist', discipline: 'PLANETARY SCIENCE' },
    { id: 'astrobiology', label: 'Astrobiologist',      discipline: 'ASTROBIOLOGY' },
    { id: 'explorer',     label: 'Space Explorer',      discipline: 'EXPLORATION' },
  ];

  H.MISSIONS = [
    { id: 'explore',   label: 'Explore' },
    { id: 'research',  label: 'Research' },
    { id: 'life',      label: 'Search for Life' },
    { id: 'worlds',    label: 'Discover New Worlds' },
    { id: 'universe',  label: 'Study the Universe' },
    { id: 'tech',      label: 'Build New Technology' },
  ];

  const CALLSIGNS = [
    'NOVA', 'ORION', 'STELLAR', 'LUNAR', 'COSMOS', 'AURORA', 'NEBULA', 'VEGA', 'ALTAIR', 'SIRIUS',
    'POLARIS', 'QUASAR', 'PULSAR', 'ZENITH', 'APOLLO', 'ARTEMIS', 'HELIOS', 'TITAN', 'EUROPA', 'KEPLER',
    'GALILEO', 'VOYAGER', 'PIONEER', 'COMET', 'ECLIPSE', 'EQUINOX', 'PHOENIX', 'ANDROMEDA', 'LYRA', 'CYGNUS',
    'DRACO', 'RIGEL', 'ANTARES', 'DENEB', 'CASSINI', 'ATLAS', 'SPICA', 'CAPELLA', 'ARCTURUS', 'PERSEUS',
    'CASSIOPEIA', 'HORIZON', 'SOLARIS', 'ASTRA', 'CELESTE', 'MERIDIAN', 'PARSEC', 'QUANTUM', 'ION', 'HALO',
  ];

  H.generateCallsign = function (current) {
    let pick;
    do { pick = CALLSIGNS[Math.floor(Math.random() * CALLSIGNS.length)]; } while (pick === current);
    return pick;
  };

  H.cleanCallsign = function (s) {
    return String(s || '').toUpperCase().replace(/[^\p{L}\p{N}\- ]/gu, '').replace(/\s+/g, '-').slice(0, 16);
  };

  H.missionClass = function (destIndex, roleIndex) {
    const d = H.DESTINATIONS[destIndex], r = H.ROLES[roleIndex];
    if (!d || !r) return '';
    return `${d.adj} ${r.discipline} ${d.noun}`;
  };

  // Random 6-digit serial, never repeated on this device.
  H.newPassportNumber = function () {
    const KEY = 'hema-passport-issued';
    let issued = [];
    try { issued = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { /* storage unavailable */ }
    const used = new Set(issued);
    let n;
    do {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      n = String(1 + (buf[0] % 999999)).padStart(6, '0');
    } while (used.has(n));
    issued.push(n);
    try { localStorage.setItem(KEY, JSON.stringify(issued.slice(-5000))); } catch (e) { /* ignore */ }
    return n;
  };

  H.formatDate = function (iso) {
    const [y, m, d] = String(iso).split('-').map(Number);
    const M = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    if (!y || !m || !d) return '';
    return `${String(d).padStart(2, '0')} ${M[m - 1]} ${y}`;
  };

  H.todayISO = function () {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  };

  /* ---------- Machine-readable zone (ICAO 9303 style, 2 × 44) ---------- */
  function mrzClean(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
      .replace(/[^A-Z0-9]+/g, '<').replace(/^<+|<+$/g, '');
  }
  function checkDigit(s) {
    const w = [7, 3, 1];
    let sum = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      const v = c === '<' ? 0 : /\d/.test(c) ? +c : c.charCodeAt(0) - 55;
      sum += v * w[i % 3];
    }
    return String(sum % 10);
  }
  H.mrz = function (p) {
    const parts = String(p.name || '').trim().split(/\s+/);
    let surname = mrzClean(parts.length > 1 ? parts[parts.length - 1] : parts[0]);
    let given = mrzClean(parts.slice(0, -1).join(' '));
    if (!surname) { surname = mrzClean(p.callsign) || 'HOLDER'; given = ''; } // non-Latin names
    const line1 = ('P<HMA' + surname + '<<' + given).padEnd(44, '<').slice(0, 44);

    const doc = ('KAF' + p.serial).padEnd(9, '<').slice(0, 9);
    const expiry = '991231';
    const personal = mrzClean(p.callsign).padEnd(14, '<').slice(0, 14);
    const dob = '<<<<<<';
    const body = doc + checkDigit(doc) + 'SOL' + dob + checkDigit(dob) + '<' + expiry + checkDigit(expiry) + personal + checkDigit(personal);
    const composite = doc + checkDigit(doc) + dob + checkDigit(dob) + expiry + checkDigit(expiry) + personal + checkDigit(personal);
    const line2 = (body + checkDigit(composite)).slice(0, 44);
    return [line1, line2];
  };
})(window.HEMA);
