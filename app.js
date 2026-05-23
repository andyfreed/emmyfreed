// Emmy's site — shared login + friend profiles, backed by the SAME Supabase
// project as the slime maker game (project ref: xikissitwexetetaurnm).
//
// Because the site and /slimemaker are on the same domain and use the same
// Supabase project, the login session is shared automatically: sign in here
// and you're signed in to the game too, and vice versa.
//
// The login scheme MUST stay identical to the slime maker's, or accounts won't
// line up across the two apps:
//   email    = normalizeUsername(name) + "@slimemaker.game"
//   password = "slime-kid-" + fourDigitCode + "-play"
// (see slime-maker repo src/App.tsx — keep these in sync)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://xikissitwexetetaurnm.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpa2lzc2l0d2V4ZXRldGF1cm5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMjE3MDksImV4cCI6MjA4NjY5NzcwOX0.RaoUV5pYIYZjQRHiFIOQd_8jaM3oAgzqtJkNgRlFczY';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const EMAIL_DOMAIN = '@slimemaker.game';
const normalizeUsername = (raw) =>
  raw.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
const buildKidPassword = (code) => `slime-kid-${code}-play`;

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

/* ============================ EDITABLE TEXT ============================ */
// Pull the site's editable text from Supabase (so Emmy's edits show up
// instantly), falling back to the committed JSON if Supabase is unreachable.
async function loadContent() {
  let data = null;
  try {
    const { data: row } = await sb
      .from('site_content')
      .select('data')
      .eq('id', 'main')
      .maybeSingle();
    if (row && row.data) data = row.data;
  } catch {
    /* ignore — fall back below */
  }
  if (!data) {
    try {
      const r = await fetch('/content/site.json', { cache: 'no-cache' });
      if (r.ok) data = await r.json();
    } catch {
      /* leave hardcoded HTML text in place */
    }
  }
  if (!data) return;
  document.querySelectorAll('[data-cms]').forEach((el) => {
    const v = el
      .getAttribute('data-cms')
      .split('.')
      .reduce((o, k) => (o == null ? o : o[k]), data);
    if (typeof v === 'string') el.textContent = v;
  });
}

/* ================================ AUTH ================================ */
async function currentUser() {
  const { data } = await sb.auth.getSession();
  return data.session?.user ?? null;
}

async function fetchProfile(userId) {
  const { data } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
  return data ?? null;
}

async function logIn(rawName, code) {
  const username = normalizeUsername(rawName);
  if (username.length < 2) throw new Error('Name must be at least 2 letters.');
  if (!/^\d{4}$/.test(code)) throw new Error('Code must be exactly 4 numbers.');

  const email = username + EMAIL_DOMAIN;
  const password = buildKidPassword(code);

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    // Login failed — the account may not exist yet, so try to create it.
    const { error: upErr } = await sb.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });
    if (upErr) {
      if (/already|registered|exists/i.test(upErr.message))
        throw new Error('That name is taken with a different code.');
      throw new Error(upErr.message || 'Could not create your account.');
    }
    const { error: e2 } = await sb.auth.signInWithPassword({ email, password });
    if (e2) throw new Error(e2.message || 'Could not log in.');
  }

  // Make sure a profile row exists (new sign-ups need one).
  const user = await currentUser();
  let prof = await fetchProfile(user.id);
  if (!prof) {
    const { error: insErr } = await sb.from('profiles').insert({ id: user.id, username });
    if (insErr && !/duplicate|already|23505/i.test(insErr.message || '')) throw insErr;
    prof = await fetchProfile(user.id);
  }
  return prof;
}

async function logOut() {
  await sb.auth.signOut();
}

/* ============================== RENDERING ============================== */
function memberSince(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

// A little CSS slime blob in a given color, with optional sparkle/charm badges.
function slimeBlob(color, sparkle, charm, size) {
  const c = /^#[0-9a-fA-F]{3,8}$/.test(color || '') ? color : '#B4E4B4';
  const badges =
    (sparkle && sparkle !== 'none' ? '✨' : '') + (charm && charm !== 'none' ? '🎀' : '');
  return (
    `<span class="slime-blob" style="--blob:${esc(c)};width:${size}px;height:${size}px">` +
    (badges ? `<span class="slime-blob-badges">${badges}</span>` : '') +
    `</span>`
  );
}

function statChip(emoji, label) {
  return `<span class="stat-chip">${emoji} ${esc(label)}</span>`;
}

function renderMeCard(prof, slimeCount) {
  const colors = (prof.owned_colors || []).length;
  const sparkles = (prof.owned_sparkles || []).filter((s) => s && s !== 'none').length;
  const charms = (prof.owned_charms || []).filter((c) => c && c !== 'none').length;
  $('me-card').innerHTML =
    `<div class="me-card-top">` +
    `<h3 class="me-hi">hi, ${esc(prof.username)}! 👋</h3>` +
    `<button class="signout-btn" id="signout-btn">sign out</button>` +
    `</div>` +
    `<div class="stat-chips">` +
    statChip('🪙', `${prof.coins ?? 0} coins`) +
    statChip('🫧', `${slimeCount} slime${slimeCount === 1 ? '' : 's'}`) +
    statChip('🎨', `${colors} colors`) +
    statChip('✨', `${sparkles} sparkles`) +
    statChip('🎀', `${charms} charms`) +
    (prof.created_at ? statChip('📅', `since ${memberSince(prof.created_at)}`) : '') +
    `</div>` +
    `<a href="/slimemaker" class="btn btn-primary me-play-btn">🧪 make more slime →</a>`;
  $('signout-btn').addEventListener('click', async () => {
    await logOut();
    await refresh();
  });
}

function renderPlayersGrid(players) {
  const grid = $('players-grid');
  if (!players.length) {
    grid.innerHTML = `<p class="players-empty">no players yet — be the first! 🫧</p>`;
    return;
  }
  grid.innerHTML = players
    .map((p) => {
      const newest = p.slimes[0];
      const color = newest ? newest.color : '#E7C6FF';
      return (
        `<button class="player-tile" data-uid="${esc(p.id)}">` +
        slimeBlob(color, newest?.sparkle, newest?.charm, 56) +
        `<span class="player-tile-name">${esc(p.username)}</span>` +
        `<span class="player-tile-meta">${p.slimes.length} slime${
          p.slimes.length === 1 ? '' : 's'
        } · 🪙${p.coins ?? 0}</span>` +
        `</button>`
      );
    })
    .join('');
  grid.querySelectorAll('.player-tile').forEach((tile) => {
    tile.addEventListener('click', () => {
      const p = players.find((x) => x.id === tile.getAttribute('data-uid'));
      if (p) openPlayerModal(p);
    });
  });
}

function openPlayerModal(p) {
  const slimes = p.slimes
    .map(
      (s) =>
        `<div class="modal-slime">` +
        slimeBlob(s.color, s.sparkle, s.charm, 64) +
        `<span class="modal-slime-name">${esc(s.name || 'slime')}</span>` +
        `</div>`
    )
    .join('');
  $('player-modal-body').innerHTML =
    `<h3 class="modal-username">${esc(p.username)}</h3>` +
    `<div class="stat-chips modal-chips">` +
    statChip('🪙', `${p.coins ?? 0} coins`) +
    statChip('🫧', `${p.slimes.length} slimes`) +
    (p.created_at ? statChip('📅', `since ${memberSince(p.created_at)}`) : '') +
    `</div>` +
    `<h4 class="modal-collection-title">slime collection 🌈</h4>` +
    (p.slimes.length
      ? `<div class="modal-slimes">${slimes}</div>`
      : `<p class="players-empty">no slimes yet!</p>`);
  const modal = $('player-modal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closePlayerModal() {
  const modal = $('player-modal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

async function loadEveryone(myId) {
  const [{ data: profiles }, { data: slimes }] = await Promise.all([
    sb.from('profiles').select('*'),
    sb.from('slimes').select('id, user_id, name, color, sparkle, charm, created_at'),
  ]);
  const byUser = new Map();
  (slimes || [])
    .sort((a, b) => (b.created_at > a.created_at ? 1 : -1))
    .forEach((s) => {
      if (!byUser.has(s.user_id)) byUser.set(s.user_id, []);
      byUser.get(s.user_id).push(s);
    });
  return (profiles || [])
    .map((p) => ({ ...p, slimes: byUser.get(p.id) || [] }))
    .sort((a, b) => {
      // me first, then most slimes
      if (a.id === myId) return -1;
      if (b.id === myId) return 1;
      return b.slimes.length - a.slimes.length;
    });
}

/* ============================ VIEW SWITCHING ============================ */
function showSignedOut() {
  $('players-signin').hidden = false;
  $('players-signin').classList.add('in'); // reveal even if it was hidden at load
  $('players-app').hidden = true;
}

async function showSignedIn(prof) {
  $('players-signin').hidden = true;
  $('players-app').hidden = false;
  $('me-card').classList.add('in');
  const players = await loadEveryone(prof.id);
  const me = players.find((p) => p.id === prof.id) || { ...prof, slimes: [] };
  renderMeCard(prof, me.slimes.length);
  renderPlayersGrid(players);
}

async function refresh() {
  const user = await currentUser();
  if (!user) return showSignedOut();
  const prof = await fetchProfile(user.id);
  if (!prof) return showSignedOut();
  return showSignedIn(prof);
}

/* ================================ WIRING ================================ */
function wire() {
  const form = $('login-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = $('login-error');
      errEl.hidden = true;
      const btn = $('login-btn');
      btn.disabled = true;
      const orig = btn.textContent;
      btn.textContent = 'one sec…';
      try {
        const prof = await logIn($('login-username').value, $('login-code').value);
        $('login-username').value = '';
        $('login-code').value = '';
        await showSignedIn(prof);
      } catch (err) {
        errEl.textContent = err.message || 'Hmm, that didn’t work.';
        errEl.hidden = false;
      } finally {
        btn.disabled = false;
        btn.textContent = orig;
      }
    });
  }

  const modal = $('player-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('.player-modal-close')) closePlayerModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePlayerModal();
    });
  }

  // Keep the UI in sync if the kid logs in/out in the slime game tab.
  sb.auth.onAuthStateChange(() => {
    refresh();
  });
}

loadContent();
wire();
refresh();
