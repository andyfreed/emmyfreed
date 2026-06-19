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

/* ============================ SHARED STATE ============================ */
let MY_ID = null;            // current user's profile id
let ALL_PLAYERS = [];        // everyone, with their slimes attached
let modalPlayer = null;      // player currently shown in the profile modal
let guestbookEntries = [];   // guestbook rows
const voteState = new Map(); // slime_id -> { count, mine }

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
  const at = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), data);

  // Editable text
  document.querySelectorAll('[data-cms]').forEach((el) => {
    const v = at(el.getAttribute('data-cms'));
    if (typeof v === 'string' && v.length) el.textContent = v;
  });

  // Uploaded photos: drop the image in as a cover background and hide the
  // placeholder drawing. If no image is set yet, the placeholder stays.
  document.querySelectorAll('[data-cms-img]').forEach((el) => {
    const url = at(el.getAttribute('data-cms-img'));
    if (typeof url === 'string' && /^https?:\/\//.test(url)) {
      el.style.backgroundImage = `url("${url}")`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.classList.add('has-photo');
      const svg = el.querySelector('svg');
      if (svg) svg.style.display = 'none';
    }
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

function validateCreds(rawName, code) {
  const username = normalizeUsername(rawName);
  if (username.length < 2) throw new Error('Name must be at least 2 letters.');
  if (!/^\d{4}$/.test(code)) throw new Error('Code must be exactly 4 numbers.');
  return { username, email: username + EMAIL_DOMAIN, password: buildKidPassword(code) };
}

async function ensureProfile(username) {
  const user = await currentUser();
  let prof = await fetchProfile(user.id);
  if (!prof) {
    const { error: insErr } = await sb.from('profiles').insert({ id: user.id, username });
    if (insErr && !/duplicate|already|23505/i.test(insErr.message || '')) throw insErr;
    prof = await fetchProfile(user.id);
  }
  return prof;
}

// Strict log in — never creates an account by accident.
async function logIn(rawName, code) {
  const { username, email, password } = validateCreds(rawName, code);
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { const e = new Error("That name and code don't match."); e.offerSignup = true; throw e; }
  return ensureProfile(username);
}

// Explicit account creation (also works in the slime game — same login).
async function createAccount(rawName, code) {
  const { username, email, password } = validateCreds(rawName, code);
  // If it already exists with this exact code, just log them in.
  const signin = await sb.auth.signInWithPassword({ email, password });
  if (!signin.error) return ensureProfile(username);
  // Otherwise try to create it.
  const { error: upErr } = await sb.auth.signUp({ email, password, options: { data: { username } } });
  if (upErr) {
    if (/already|registered|exists/i.test(upErr.message))
      throw new Error('That name is already taken. Pick a different one (or log in if it’s yours).');
    throw new Error(upErr.message || 'Could not create your account.');
  }
  const { error: e2 } = await sb.auth.signInWithPassword({ email, password });
  if (e2) throw new Error('Account made, but sign-in failed. Try logging in.');
  return ensureProfile(username);
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

// A bouncy, on-brand empty state (dashed card + big bobbing emoji).
function emptyState(emoji, title, sub) {
  return (
    `<div class="empty-card">` +
    `<span class="empty-emoji">${emoji}</span>` +
    `<p class="empty-title">${esc(title)}</p>` +
    (sub ? `<p class="empty-sub">${esc(sub)}</p>` : '') +
    `</div>`
  );
}

/* ---- Achievement badges (computed from stats kids already have) ---- */
const BADGES = [
  { emoji: '🫧', label: 'First Slime',    test: (s) => s.slimes >= 1 },
  { emoji: '✨', label: 'Sparkle Star',   test: (s) => s.sparkles >= 1 },
  { emoji: '🎀', label: 'Charm Charmer',  test: (s) => s.charms >= 1 },
  { emoji: '🎨', label: 'Color Picker',   test: (s) => s.colors >= 3 },
  { emoji: '🖐️', label: 'High Five',      test: (s) => s.slimes >= 5 },
  { emoji: '🌈', label: 'Rainbow Maker',  test: (s) => s.colors >= 8 },
  { emoji: '🪙', label: 'Coin Collector', test: (s) => s.coins >= 500 },
  { emoji: '🏆', label: 'Slime Master',   test: (s) => s.slimes >= 20 },
  { emoji: '💎', label: 'Slime Legend',   test: (s) => s.slimes >= 40 },
  { emoji: '👑', label: 'Coin Champion',  test: (s) => s.coins >= 1000 },
];
function statsOf(p, slimeCount) {
  return {
    coins: p.coins ?? 0,
    colors: (p.owned_colors || []).length,
    sparkles: (p.owned_sparkles || []).filter((x) => x && x !== 'none').length,
    charms: (p.owned_charms || []).filter((x) => x && x !== 'none').length,
    slimes: slimeCount,
  };
}
function badgesHtml(stats) {
  const earned = BADGES.filter((b) => b.test(stats));
  if (!earned.length) return '';
  return (
    `<div class="badges">` +
    earned
      .map(
        (b) =>
          `<span class="badge" title="${esc(b.label)}"><span class="badge-emoji">${b.emoji}</span>` +
          `<span class="badge-label">${esc(b.label)}</span></span>`
      )
      .join('') +
    `</div>`
  );
}

function renderMeCard(prof, slimeCount) {
  const stats = statsOf(prof, slimeCount);
  $('me-card').innerHTML =
    `<div class="me-card-top">` +
    `<h3 class="me-hi">hi, ${esc(prof.username)}! 👋</h3>` +
    `<button class="signout-btn" id="signout-btn">sign out</button>` +
    `</div>` +
    `<div class="stat-chips">` +
    statChip('🪙', `${stats.coins} coins`) +
    statChip('🫧', `${slimeCount} slime${slimeCount === 1 ? '' : 's'}`) +
    statChip('🎨', `${stats.colors} colors`) +
    statChip('✨', `${stats.sparkles} sparkles`) +
    statChip('🎀', `${stats.charms} charms`) +
    (prof.created_at ? statChip('📅', `since ${memberSince(prof.created_at)}`) : '') +
    `</div>` +
    badgesHtml(stats) +
    birthdayControlHtml(prof) +
    `<div class="me-play-row">` +
    `<a href="/chat" class="btn btn-primary me-play-btn">💬 open chat</a>` +
    `<a href="/slimemaker" class="btn btn-primary me-play-btn">🧪 make more slime →</a>` +
    `</div>`;
  $('signout-btn').addEventListener('click', signOutAndRefresh);
  wireBirthday();
}

function birthdayControlHtml(prof) {
  const pretty = prettyBirthday(prof.birthday);
  return (
    `<div class="bday-row">` +
    (pretty
      ? `<button type="button" class="bday-chip" id="bday-edit">🎂 my birthday: ${esc(pretty)} <span class="bday-pencil">✎</span></button>`
      : `<button type="button" class="bday-chip add" id="bday-edit">🎂 add my birthday</button>`) +
    `<div class="bday-editor" id="bday-editor" hidden>` +
    `<input type="date" id="bday-input" class="bday-input" />` +
    `<button type="button" class="bday-save" id="bday-save">save</button>` +
    `<button type="button" class="bday-cancel" id="bday-cancel">cancel</button>` +
    `<span class="bday-note">we only keep the month & day 💜</span>` +
    `</div></div>`
  );
}

function wireBirthday() {
  const editBtn = $('bday-edit');
  const editor = $('bday-editor');
  if (!editBtn || !editor) return;
  editBtn.addEventListener('click', () => {
    editor.hidden = !editor.hidden;
    if (!editor.hidden) $('bday-input').focus();
  });
  $('bday-cancel').addEventListener('click', () => { editor.hidden = true; });
  $('bday-save').addEventListener('click', async () => {
    const val = $('bday-input').value; // yyyy-mm-dd
    if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) { editor.hidden = true; return; }
    const mmdd = val.slice(5); // mm-dd only — never store the year
    const btn = $('bday-save');
    btn.disabled = true;
    const { error } = await sb.from('profiles').update({ birthday: mmdd }).eq('id', MY_ID);
    btn.disabled = false;
    if (!error) refresh();
  });
}

function renderPlayersGrid(players) {
  const grid = $('players-grid');
  if (!players.length) {
    grid.innerHTML = emptyState('🫧', 'no players yet — be the first!', 'make a slime and your friends will show up here');
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

// "What's New ✨" — the 5 most-recently-made slimes across all friends.
function renderWhatsNew(players) {
  const box = $('whats-new');
  if (!box) return;
  const recent = players
    .flatMap((p) => p.slimes.map((s) => ({ ...s, username: p.username })))
    .sort((a, b) => (b.created_at > a.created_at ? 1 : -1))
    .slice(0, 5);
  if (!recent.length) { box.innerHTML = ''; return; }
  box.innerHTML =
    `<h3 class="whats-new-title">what's new ✨</h3>` +
    `<div class="whats-new-row">` +
    recent
      .map(
        (s) =>
          `<div class="whats-new-item">` +
          slimeBlob(s.color, s.sparkle, s.charm, 40) +
          `<span class="whats-new-text"><b>${esc(s.username)}</b> made a new slime!</span>` +
          `</div>`
      )
      .join('') +
    `</div>`;
}

function renderBirthdayBanner(players, today) {
  const box = $('bday-banner');
  if (!box) return;
  const names = players.filter((p) => p.birthday === today).map((p) => p.username);
  if (!names.length) { box.hidden = true; box.innerHTML = ''; return; }
  const who = names.length === 1 ? `${esc(names[0])}'s` : `${names.map(esc).join(' & ')}'s`;
  box.hidden = false;
  box.innerHTML =
    `<span class="bday-confetti" aria-hidden="true">🎉🎂🎈</span>` +
    `<span class="bday-text">it's ${who} birthday today! 🥳</span>` +
    `<span class="bday-confetti" aria-hidden="true">🎈🎂🎉</span>`;
}

// "Most-loved slimes 🏆" — all-time top 3 by hearts (hidden until something has a heart).
function renderMostLoved() {
  const box = $('most-loved');
  if (!box) return;
  const ranked = ALL_PLAYERS
    .flatMap((p) => p.slimes.map((s) => ({ ...s, username: p.username, hearts: (voteState.get(s.id) || {}).count || 0 })))
    .filter((s) => s.hearts > 0)
    .sort((a, b) => b.hearts - a.hearts)
    .slice(0, 3);
  if (!ranked.length) { box.innerHTML = ''; return; }
  const medals = ['🥇', '🥈', '🥉'];
  box.innerHTML =
    `<h3 class="most-loved-title">most-loved slimes 🏆</h3>` +
    `<div class="most-loved-row">` +
    ranked
      .map(
        (s, i) =>
          `<div class="most-loved-item">` +
          `<span class="most-loved-medal">${medals[i]}</span>` +
          slimeBlob(s.color, s.sparkle, s.charm, 44) +
          `<span class="most-loved-info"><b>${esc(s.name || 'slime')}</b><span>by ${esc(s.username)}</span></span>` +
          `<span class="most-loved-hearts">💖 ${s.hearts}</span>` +
          `</div>`
      )
      .join('') +
    `</div>`;
}

function openPlayerModal(p) {
  modalPlayer = p;
  const slimes = p.slimes
    .map((s) => {
      const v = voteState.get(s.id) || { count: 0, mine: false };
      return (
        `<div class="modal-slime">` +
        slimeBlob(s.color, s.sparkle, s.charm, 64) +
        `<span class="modal-slime-name">${esc(s.name || 'slime')}</span>` +
        `<button class="heart-btn ${v.mine ? 'mine' : ''}" data-heart="${esc(s.id)}" aria-pressed="${v.mine}">` +
        `💖 <span>${v.count}</span></button>` +
        `</div>`
      );
    })
    .join('');
  const stats = statsOf(p, p.slimes.length);
  $('player-modal-body').innerHTML =
    `<h3 class="modal-username">${esc(p.username)}</h3>` +
    `<div class="stat-chips modal-chips">` +
    statChip('🪙', `${stats.coins} coins`) +
    statChip('🫧', `${p.slimes.length} slimes`) +
    statChip('🎨', `${stats.colors} colors`) +
    (p.created_at ? statChip('📅', `since ${memberSince(p.created_at)}`) : '') +
    `</div>` +
    badgesHtml(stats) +
    `<h4 class="modal-collection-title">slime collection 🌈</h4>` +
    (p.slimes.length
      ? `<div class="modal-slimes">${slimes}</div>`
      : emptyState('🫧', 'no slimes yet!', 'tap “make more slime” to start a collection'));
  const modal = $('player-modal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closePlayerModal() {
  const modal = $('player-modal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  modalPlayer = null;
}

// Heart / un-heart a friend's slime (optimistic; reverts on error).
async function toggleHeart(slimeId) {
  if (!MY_ID) return;
  const v = voteState.get(slimeId) || { count: 0, mine: false };
  const wasMine = v.mine;
  v.mine = !wasMine;
  v.count = Math.max(0, v.count + (wasMine ? -1 : 1));
  voteState.set(slimeId, v);
  if (modalPlayer) openPlayerModal(modalPlayer);
  renderMostLoved();
  const res = wasMine
    ? await sb.from('slime_votes').delete().eq('slime_id', slimeId).eq('user_id', MY_ID)
    : await sb.from('slime_votes').insert({ slime_id: slimeId, user_id: MY_ID });
  if (res.error) {
    // revert on failure
    v.mine = wasMine;
    v.count = Math.max(0, v.count + (wasMine ? 1 : -1));
    voteState.set(slimeId, v);
    if (modalPlayer) openPlayerModal(modalPlayer);
    renderMostLoved();
  }
}

/* ============================== GUESTBOOK ============================== */
const NOTE_COLORS = ['#FFF1A5', '#FFB5D8', '#B4E4B4', '#7DD3FC', '#E7C6FF', '#FFD6A5'];
function noteColor(name) {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return NOTE_COLORS[h % NOTE_COLORS.length];
}
function renderGuestbook(prof) {
  const box = $('guestbook');
  if (!box) return;
  const mine = guestbookEntries.find((g) => g.user_id === prof.id);
  const notes = guestbookEntries
    .map((g) => {
      const canDelete = g.user_id === prof.id || prof.is_admin;
      return (
        `<div class="gb-note" style="--c:${noteColor(g.username)}">` +
        `<p class="gb-body">${esc(g.body)}</p>` +
        `<p class="gb-by">— ${esc(g.username)}</p>` +
        (canDelete ? `<button class="gb-del" data-gbdel="${esc(g.user_id)}" aria-label="Delete note">✕</button>` : '') +
        `</div>`
      );
    })
    .join('');
  box.innerHTML =
    `<h3 class="gb-title">friends' guestbook 📝</h3>` +
    `<div class="gb-composer">` +
    `<textarea id="gb-input" maxlength="200" placeholder="leave a nice note for everyone…">${esc(mine ? mine.body : '')}</textarea>` +
    `<button type="button" class="btn btn-primary gb-save" id="gb-save">${mine ? 'update my note ✍️' : 'sign the guestbook ✍️'}</button>` +
    `</div>` +
    (notes ? `<div class="gb-wall">${notes}</div>` : emptyState('📝', 'no notes yet!', 'be the first to sign the guestbook'));
  wireGuestbook(prof);
}
function wireGuestbook(prof) {
  const save = $('gb-save');
  if (save) {
    save.addEventListener('click', async () => {
      const body = ($('gb-input').value || '').trim();
      if (!body) return;
      save.disabled = true;
      const { error } = await sb
        .from('guestbook')
        .upsert({ user_id: prof.id, username: prof.username, body, updated_at: new Date().toISOString() });
      save.disabled = false;
      if (!error) refresh();
    });
  }
  $('guestbook').querySelectorAll('[data-gbdel]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const uid = btn.getAttribute('data-gbdel');
      const { error } = await sb.from('guestbook').delete().eq('user_id', uid);
      if (!error) refresh();
    });
  });
}

async function loadEveryone(myId) {
  const [{ data: profiles }, { data: slimes }, { data: votes }, { data: guests }] = await Promise.all([
    sb.from('profiles').select('*'),
    sb.from('slimes').select('id, user_id, name, color, sparkle, charm, created_at'),
    sb.from('slime_votes').select('slime_id, user_id'),
    sb.from('guestbook').select('*').order('created_at', { ascending: false }),
  ]);
  // Tally hearts per slime, and whether I hearted it.
  voteState.clear();
  (votes || []).forEach((v) => {
    const e = voteState.get(v.slime_id) || { count: 0, mine: false };
    e.count++;
    if (v.user_id === myId) e.mine = true;
    voteState.set(v.slime_id, e);
  });
  guestbookEntries = guests || [];
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
function setAdminNav(isAdmin) {
  const item = document.getElementById('nav-admin-item');
  if (item) item.hidden = !isAdmin;
  const footer = document.getElementById('footer-edit');
  if (footer) footer.hidden = !isAdmin;
}

async function signOutAndRefresh() {
  await logOut();
  await refresh();
}

function setAuthNav(prof) {
  const out = document.getElementById('nav-auth-loggedout');
  const inn = document.getElementById('nav-auth-loggedin');
  const name = document.getElementById('nav-username');
  if (!out || !inn) return;
  if (prof) {
    out.hidden = true;
    inn.hidden = false;
    if (name) name.textContent = prof.username || 'friend';
  } else {
    out.hidden = false;
    inn.hidden = true;
  }
}

function showSignedOut() {
  $('players-signin').hidden = false;
  $('players-signin').classList.add('in'); // reveal even if it was hidden at load
  $('players-app').hidden = true;
  setAdminNav(false);
  setAuthNav(null);
}

async function showSignedIn(prof) {
  $('players-signin').hidden = true;
  $('players-app').hidden = false;
  $('me-card').classList.add('in');
  setAdminNav(!!prof.is_admin);
  setAuthNav(prof);
  MY_ID = prof.id;
  let players = await loadEveryone(prof.id);
  // Birthday kids float to the very top today.
  const today = todayMMDD();
  players = players.slice().sort((a, b) => {
    const ab = a.birthday === today ? 1 : 0;
    const bb = b.birthday === today ? 1 : 0;
    if (ab !== bb) return bb - ab;
    return 0;
  });
  ALL_PLAYERS = players;
  const me = players.find((p) => p.id === prof.id) || { ...prof, slimes: [] };
  renderBirthdayBanner(players, today);
  renderMeCard(prof, me.slimes.length);
  renderWhatsNew(players);
  renderMostLoved();
  renderPlayersGrid(players);
  renderGuestbook(prof);
}

function todayMMDD() {
  const d = new Date();
  return String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function prettyBirthday(mmdd) {
  if (!/^\d{2}-\d{2}$/.test(mmdd || '')) return '';
  const [m, d] = mmdd.split('-').map(Number);
  if (m < 1 || m > 12) return '';
  return `${MONTHS[m - 1]} ${d}`;
}

async function refresh() {
  const user = await currentUser();
  if (!user) return showSignedOut();
  const prof = await fetchProfile(user.id);
  if (!prof) return showSignedOut();
  return showSignedIn(prof);
}

/* ================================ WIRING ================================ */
let authMode = 'login'; // 'login' | 'signup'

function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll('.auth-tab').forEach((t) => t.classList.toggle('active', t.getAttribute('data-mode') === mode));
  const signup = mode === 'signup';
  $('confirm-wrap').hidden = !signup;
  $('login-btn').textContent = signup ? 'create my account →' : "let's go! →";
  $('auth-title').textContent = signup ? 'make a new account 🌟' : 'log in to play & chat 🌈';
  $('auth-sub').textContent = signup ? 'pick a name and a secret 4-number code' : 'use your name & 4-number code';
  $('login-error').hidden = true;
}

// Show a login error, optionally with a one-tap "make a new account" button
// that flips the form to sign-up (carrying the name they already typed).
function showLoginError(msg, offerSignup) {
  const errEl = $('login-error');
  errEl.innerHTML =
    `<span>${esc(msg)}</span>` +
    (offerSignup ? ` <button type="button" class="login-error-action" id="login-go-signup">make a new account →</button>` : '');
  errEl.hidden = false;
  const go = document.getElementById('login-go-signup');
  if (go) go.addEventListener('click', () => { setAuthMode('signup'); $('login-code').focus(); });
}

function wire() {
  document.querySelectorAll('.auth-tab').forEach((tab) =>
    tab.addEventListener('click', () => setAuthMode(tab.getAttribute('data-mode')))
  );

  const navOut = document.getElementById('nav-signout-btn');
  if (navOut) navOut.addEventListener('click', signOutAndRefresh);

  const form = $('login-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = $('login-error');
      errEl.hidden = true;
      const btn = $('login-btn');
      const orig = btn.textContent;
      const name = $('login-username').value;
      const code = $('login-code').value;
      if (authMode === 'signup' && $('login-code2').value.trim() !== code.trim()) {
        errEl.textContent = 'Your two codes are different — type the same 4 numbers twice.';
        errEl.hidden = false;
        return;
      }
      btn.disabled = true;
      btn.textContent = 'one sec…';
      try {
        const prof = authMode === 'signup' ? await createAccount(name, code) : await logIn(name, code);
        $('login-username').value = '';
        $('login-code').value = '';
        $('login-code2').value = '';
        await showSignedIn(prof);
      } catch (err) {
        showLoginError(err.message || 'Hmm, that didn’t work.', !!err.offerSignup);
        // Keep the name, clear just the code so a mistyped code is one quick retry.
        $('login-code').value = '';
        $('login-code2').value = '';
        $('login-code').focus();
      } finally {
        btn.disabled = false;
        btn.textContent = orig;
      }
    });
  }

  const modal = $('player-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      const heart = e.target.closest('[data-heart]');
      if (heart) { toggleHeart(heart.getAttribute('data-heart')); return; }
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
