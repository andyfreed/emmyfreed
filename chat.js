// Emmy's friends chat — realtime, backed by the same Supabase project as the
// game and the rest of the site (ref xikissitwexetetaurnm). Same login.
//
// Glitch-prevention strategy:
//  - Messages are keyed by id in a Map, so the realtime echo of our own insert
//    (and any reconnect re-fetch) can't create duplicates.
//  - Optimistic send: show the message instantly with a temp id, then swap in
//    the real row when the insert returns.
//  - On every (re)subscribe we re-fetch recent history, so a dropped connection
//    can't leave us missing messages.
//  - Reactions are tracked by their own row id, so DELETE events (which only
//    carry the primary key) can still be applied correctly.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://xikissitwexetetaurnm.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpa2lzc2l0d2V4ZXRldGF1cm5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMjE3MDksImV4cCI6MjA4NjY5NzcwOX0.RaoUV5pYIYZjQRHiFIOQd_8jaM3oAgzqtJkNgRlFczY';
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const EMAIL_DOMAIN = '@slimemaker.game';
const normalizeUsername = (raw) => raw.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
const buildKidPassword = (code) => `slime-kid-${code}-play`;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

const QUICK = ['👍', '❤️', '😂', '🎉', '😮', '😢'];
const EMOJIS = [
  '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😉','😊','😍','🥰','😘','😜','🤪','😝','🤗','🤩','🥳',
  '😎','🤓','🧐','😏','😴','🤤','😋','😛','🙃','😇','🥺','😢','😭','😤','😡','😱','🤯','😬','🙄','😮',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💖','💕','💗','💓','💞','💝','✨','⭐','🌟','💫','🔥','🎉',
  '🎊','🎈','🎁','👍','👎','👏','🙌','🙏','💪','✌️','🤞','👋','🤙','👀','💯','✅','❓','❗','💤','💭',
  '🐶','🐱','🐰','🦄','🐢','🐠','🦋','🐝','🐧','🐼','🦊','🐸','🌈','🌸','🌺','🌷','🍀','🌙','☀️','⛄',
  '🍕','🍔','🍟','🌮','🍦','🍩','🍪','🎂','🧁','🍫','🍭','🍓','🍉','🍌','🍎','🥑','🧋','🧃','🎨','🎮',
  '⚽','🏀','🚲','🛼','🎸','🎤','📚','✏️','💩','👻','🤖','👽','🦖','🌊','🏖️','🎀','🪼','🫧',
];

let me = null;            // { id, username, is_admin }
let channel = null;
let firstLoad = true;
let justSent = false;
let activeMenuId = null;
let editingId = null;
let confirmingDeleteId = null;
let lastTypingSent = 0;

const messagesById = new Map();    // id -> message row (or optimistic temp)
const reactionsById = new Map();   // reaction id -> { message_id, user_id, emoji }
const typingUsers = new Map();     // username -> timeout id

/* ---------------- helpers ---------------- */
const PALETTE = ['#FF3D7F','#FFD23F','#7DD3FC','#C084FC','#B4E4B4','#FFD6A5','#FFB5D8','#E7C6FF'];
function avatarColor(name){ let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; }
function initial(name){ return (String(name || '?').trim().charAt(0) || '?').toUpperCase(); }
function fmtTime(ts){ try { return new Date(ts).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' }); } catch { return ''; } }
function isJumbo(body){
  try { const t = body.trim(); return [...t].length <= 4 && /\p{Extended_Pictographic}/u.test(t) && !/[\p{L}\p{N}]/u.test(t); }
  catch { return false; }
}
function byTime(a, b){ return new Date(a.created_at) - new Date(b.created_at); }

/* ---------------- auth ---------------- */
function validateCreds(rawName, code){
  const username = normalizeUsername(rawName);
  if (username.length < 2) throw new Error('Name must be at least 2 letters.');
  if (!/^\d{4}$/.test(code)) throw new Error('Code must be exactly 4 numbers.');
  return { username, email: username + EMAIL_DOMAIN, password: buildKidPassword(code) };
}
async function ensureProfile(username){
  const { data: ud } = await sb.auth.getUser();
  let prof = await fetchProfile(ud.user.id);
  if (!prof) { await sb.from('profiles').insert({ id: ud.user.id, username }); prof = await fetchProfile(ud.user.id); }
  return prof;
}
// One-step sign in: log in if the account exists, otherwise create it. Same
// name + code as the slime game, entered just once.
async function signInOrCreate(rawName, code){
  const { username, email, password } = validateCreds(rawName, code);
  const signin = await sb.auth.signInWithPassword({ email, password });
  if (!signin.error) return ensureProfile(username);
  const { error: upErr } = await sb.auth.signUp({ email, password, options: { data: { username } } });
  if (upErr) {
    // Name exists but the code didn't match the existing account.
    if (/already|registered|exists/i.test(upErr.message)) throw new Error("That didn't work — check your name and code, then try again.");
    throw new Error(upErr.message || 'Could not log you in.');
  }
  const { error: e2 } = await sb.auth.signInWithPassword({ email, password });
  if (e2) throw new Error('Account made, but sign-in failed. Try again.');
  return ensureProfile(username);
}
async function fetchProfile(id){
  const { data } = await sb.from('profiles').select('id, username, is_admin').eq('id', id).maybeSingle();
  return data;
}

/* ---------------- data ---------------- */
async function loadHistory(){
  const { data: msgs } = await sb.from('messages').select('*').order('created_at', { ascending: true }).limit(250);
  (msgs || []).forEach((m) => { if (!String(m.id).startsWith('temp-')) messagesById.set(m.id, m); });
  const { data: rx } = await sb.from('message_reactions').select('*');
  reactionsById.clear();
  (rx || []).forEach((r) => reactionsById.set(r.id, r));
  render();
  if (firstLoad) { scrollToBottom(); firstLoad = false; maybeShowCoach(); }
}

/* ---------------- rendering ---------------- */
function isNearBottom(){ const b = $('messages'); return b.scrollHeight - b.scrollTop - b.clientHeight < 90; }
function scrollToBottom(){ const b = $('messages'); b.scrollTop = b.scrollHeight; $('new-pill').classList.add('hidden'); }

/* one-time "tap a message to react" coach hint */
let coachTimer = null;
function maybeShowCoach(){
  try { if (localStorage.getItem('chat_coach_seen')) return; } catch { return; }
  if (!messagesById.size) return; // need a message to tap
  const el = $('coach-hint'); if (!el) return;
  el.classList.remove('hidden');
  coachTimer = setTimeout(dismissCoach, 9000);
}
function dismissCoach(){
  const el = $('coach-hint'); if (el) el.classList.add('hidden');
  if (coachTimer) { clearTimeout(coachTimer); coachTimer = null; }
  try { localStorage.setItem('chat_coach_seen', '1'); } catch { /* ignore */ }
}

function reactsHtml(msgId){
  const agg = new Map(); // emoji -> { count, mine }
  reactionsById.forEach((r) => {
    if (r.message_id !== msgId) return;
    const a = agg.get(r.emoji) || { count: 0, mine: false };
    a.count++; if (r.user_id === me.id) a.mine = true; agg.set(r.emoji, a);
  });
  if (!agg.size) return '';
  let chips = '';
  agg.forEach((a, emoji) => {
    chips += `<button class="react-chip ${a.mine ? 'mine' : ''}" data-react="${esc(msgId)}" data-emoji="${esc(emoji)}">${esc(emoji)} ${a.count}</button>`;
  });
  return `<div class="reacts">${chips}</div>`;
}
function menuHtml(m){
  let b = QUICK.map((e) => `<button data-act="react" data-id="${esc(m.id)}" data-emoji="${esc(e)}">${e}</button>`).join('');
  if (m.username === me.username) b += `<button class="txt" data-act="edit" data-id="${esc(m.id)}">edit</button><button class="txt" data-act="del" data-id="${esc(m.id)}">delete</button>`;
  else if (me.is_admin) b += `<button class="txt" data-act="del" data-id="${esc(m.id)}">delete</button>`;
  return `<div class="msg-menu">${b}</div>`;
}
function delConfirmHtml(m){
  return `<div class="msg-menu confirm-del"><span class="confirm-q">delete?</span>` +
    `<button class="txt yes" data-act="del-yes" data-id="${esc(m.id)}">yes</button>` +
    `<button class="txt" data-act="del-no">no</button></div>`;
}
function msgHtml(m){
  let inner;
  if (m.deleted) {
    inner = `<span class="bubble deleted">message deleted</span>`;
  } else if (editingId === m.id) {
    inner = `<div class="edit-box"><textarea id="edit-input">${esc(m.body)}</textarea>` +
      `<div class="edit-actions"><button class="save" data-act="save" data-id="${esc(m.id)}">save</button>` +
      `<button data-act="cancel">cancel</button></div></div>`;
  } else {
    const cls = 'bubble' + (isJumbo(m.body) ? ' jumbo' : '') + (m.pending ? ' pending' : '') + (m.failed ? ' failed' : '');
    const tag = m.edited_at ? '<span class="edited-tag">(edited)</span>' : '';
    inner = `<span class="${cls}" data-id="${esc(m.id)}" data-bubble>${esc(m.body)}${tag}</span>`;
  }
  let menu = '';
  if (confirmingDeleteId === m.id && !m.deleted) menu = delConfirmHtml(m);
  else if (activeMenuId === m.id && !m.deleted && !m.pending && editingId !== m.id) menu = menuHtml(m);
  return `<div class="msg">${menu}${inner}${m.deleted ? '' : reactsHtml(m.id)}</div>`;
}
function render(){
  const box = $('messages');
  const atBottom = isNearBottom();
  const keepTop = box.scrollTop;
  const msgs = [...messagesById.values()].sort(byTime);
  if (!msgs.length) {
    const prompts = ['say hi 👋', 'tell a joke 😂', "what's your fave slime? 🫧"];
    box.innerHTML =
      `<div class="empty-room">` +
      `<div class="empty-room-emoji">💬</div>` +
      `<p class="empty-room-title">it's quiet in here…</p>` +
      `<p class="empty-room-sub">be the first to say something! tap one:</p>` +
      `<div class="empty-room-prompts">` +
      prompts.map((p) => `<button type="button" class="prompt-chip" data-prompt="${esc(p)}">${esc(p)}</button>`).join('') +
      `</div></div>`;
    return;
  }

  let html = '', prev = null, openGroup = false;
  for (const m of msgs) {
    const newGroup = !prev || prev.username !== m.username ||
      (new Date(m.created_at) - new Date(prev.created_at) > 5 * 60000);
    if (newGroup) {
      if (openGroup) html += `</div></div>`;
      const mine = m.username === me.username;
      html += `<div class="group ${mine ? 'me' : ''}">` +
        `<span class="avatar" style="background:${avatarColor(m.username)}">${esc(initial(m.username))}</span>` +
        `<div class="stack"><p class="who">${esc(m.username)}<time>${fmtTime(m.created_at)}</time></p>`;
      openGroup = true;
    }
    html += msgHtml(m);
    prev = m;
  }
  if (openGroup) html += `</div></div>`;
  box.innerHTML = html;

  if (atBottom || justSent) scrollToBottom();
  else box.scrollTop = keepTop;
}

function renderTyping(){
  const names = [...typingUsers.keys()];
  $('typing').textContent = !names.length ? ''
    : names.length === 1 ? `${names[0]} is typing…`
    : `${names.slice(0, 2).join(', ')}${names.length > 2 ? ' and others' : ''} are typing…`;
}

/* ---------------- actions ---------------- */
async function send(){
  const input = $('msg-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = ''; autoGrow(); updateSendBtn();
  $('emoji-panel').classList.add('hidden');

  const tempId = 'temp-' + Math.random().toString(36).slice(2);
  messagesById.set(tempId, { id: tempId, user_id: me.id, username: me.username, body: text, created_at: new Date().toISOString(), pending: true });
  justSent = true; render(); justSent = false;

  try {
    const { data, error } = await sb.from('messages')
      .insert({ user_id: me.id, username: me.username, body: text }).select().single();
    if (error) throw error;
    messagesById.delete(tempId);
    messagesById.set(data.id, data);
    justSent = true; render(); justSent = false;
  } catch {
    const t = messagesById.get(tempId);
    if (t) { t.pending = false; t.failed = true; render(); }
  }
}
function retry(tempId){
  const t = messagesById.get(tempId);
  if (!t) return;
  messagesById.delete(tempId);
  $('msg-input').value = t.body; autoGrow(); updateSendBtn();
  send();
}

async function toggleReaction(msgId, emoji){
  let mineId = null;
  reactionsById.forEach((r, id) => { if (r.message_id === msgId && r.user_id === me.id && r.emoji === emoji) mineId = id; });
  if (mineId) {
    reactionsById.delete(mineId); render();
    await sb.from('message_reactions').delete().eq('id', mineId);
  } else {
    // Optimistic add: show it instantly, then swap the temp row for the real one.
    const tempId = 'temp-rx-' + Math.random().toString(36).slice(2);
    reactionsById.set(tempId, { id: tempId, message_id: msgId, user_id: me.id, emoji });
    render();
    const { data, error } = await sb.from('message_reactions').insert({ message_id: msgId, user_id: me.id, emoji }).select().single();
    reactionsById.delete(tempId);
    if (data && !error) reactionsById.set(data.id, data);
    render();
  }
}

async function saveEdit(msgId){
  const val = $('edit-input') ? $('edit-input').value.trim() : '';
  editingId = null;
  if (val) {
    const m = messagesById.get(msgId);
    if (m) { m.body = val; m.edited_at = new Date().toISOString(); }
    render();
    await sb.from('messages').update({ body: val, edited_at: new Date().toISOString() }).eq('id', msgId);
  } else { render(); }
}
async function doDelete(msgId){
  confirmingDeleteId = null;
  activeMenuId = null;
  const m = messagesById.get(msgId);
  if (m) { m.deleted = true; render(); }
  await sb.from('messages').update({ deleted: true, body: '' }).eq('id', msgId);
}

/* ---------------- composer ---------------- */
function autoGrow(){ const t = $('msg-input'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; }
function updateSendBtn(){ $('send-btn').disabled = !$('msg-input').value.trim(); }
function insertAtCursor(el, text){
  const s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, s) + text + el.value.slice(e);
  const pos = s + text.length; el.selectionStart = el.selectionEnd = pos;
  el.focus(); autoGrow(); updateSendBtn();
}
function typingBroadcast(){
  const now = Date.now();
  if (channel && now - lastTypingSent > 1500) {
    lastTypingSent = now;
    channel.send({ type: 'broadcast', event: 'typing', payload: { username: me.username } });
  }
}

/* ---------------- realtime ---------------- */
function startRealtime(){
  channel = sb.channel('chat-room', { config: { presence: { key: me.username } } });

  channel
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, ({ new: m }) => {
      const wasNew = !messagesById.has(m.id);
      messagesById.set(m.id, m);
      if (wasNew && m.username !== me.username && !isNearBottom()) $('new-pill').classList.remove('hidden');
      render();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, ({ new: m }) => {
      messagesById.set(m.id, m); render();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions' }, ({ new: r }) => {
      reactionsById.set(r.id, r); render();
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'message_reactions' }, ({ old: r }) => {
      if (r && r.id) { reactionsById.delete(r.id); render(); }
    })
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const names = new Set();
      Object.values(state).forEach((arr) => arr.forEach((p) => p.username && names.add(p.username)));
      $('online-count').textContent = names.size || 1;
    })
    .on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (!payload || payload.username === me.username) return;
      if (typingUsers.has(payload.username)) clearTimeout(typingUsers.get(payload.username));
      typingUsers.set(payload.username, setTimeout(() => { typingUsers.delete(payload.username); renderTyping(); }, 3500));
      renderTyping();
    })
    .subscribe(async (st) => {
      if (st === 'SUBSCRIBED') {
        await channel.track({ username: me.username });
        await loadHistory(); // catch up on (re)connect
        // The postgres_changes binding takes ~1-2s to warm up after SUBSCRIBED;
        // one delayed re-fetch makes sure nothing posted in that window is missed.
        setTimeout(() => { loadHistory(); }, 3000);
      }
    });
}

/* ---------------- start ---------------- */
function showChat(){ $('view-login').classList.add('hidden'); $('view-chat').classList.remove('hidden'); }

async function startChat(prof){
  me = prof;
  showChat();
  buildEmojiPanel();
  wireComposer();
  updateSendBtn();
  const { data: { session } } = await sb.auth.getSession();
  if (session) sb.realtime.setAuth(session.access_token);
  startRealtime();
}

function buildEmojiPanel(){
  $('emoji-panel').innerHTML = EMOJIS.map((e) => `<button type="button" data-emoji="${esc(e)}">${e}</button>`).join('');
}

function wireComposer(){
  const input = $('msg-input');
  input.addEventListener('input', () => { autoGrow(); updateSendBtn(); typingBroadcast(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  $('send-btn').addEventListener('click', send);
  $('emoji-btn').addEventListener('click', () => $('emoji-panel').classList.toggle('hidden'));
  $('emoji-panel').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    insertAtCursor(input, b.getAttribute('data-emoji'));
  });
  $('new-pill').addEventListener('click', scrollToBottom);

  // delegated clicks on the message list
  $('messages').addEventListener('click', (e) => {
    const prompt = e.target.closest('[data-prompt]');
    if (prompt) {
      const input = $('msg-input');
      input.value = prompt.getAttribute('data-prompt');
      input.focus(); autoGrow(); updateSendBtn();
      return;
    }
    const chip = e.target.closest('[data-react]');
    if (chip) { toggleReaction(chip.getAttribute('data-react'), chip.getAttribute('data-emoji')); return; }
    const act = e.target.closest('[data-act]');
    if (act) {
      const kind = act.getAttribute('data-act');
      const mid = act.getAttribute('data-id');
      if (kind === 'react') { toggleReaction(mid, act.getAttribute('data-emoji')); activeMenuId = null; render(); }
      else if (kind === 'edit') { editingId = mid; activeMenuId = null; render(); const ta = $('edit-input'); if (ta) ta.focus(); }
      else if (kind === 'del') { activeMenuId = null; confirmingDeleteId = mid; render(); }
      else if (kind === 'del-yes') { doDelete(mid); }
      else if (kind === 'del-no') { confirmingDeleteId = null; render(); }
      else if (kind === 'save') { saveEdit(mid); }
      else if (kind === 'cancel') { editingId = null; render(); }
      return;
    }
    const bubble = e.target.closest('[data-bubble]');
    if (bubble) {
      const mid = bubble.getAttribute('data-id');
      const m = messagesById.get(mid);
      if (m && m.failed) { retry(mid); return; }
      confirmingDeleteId = null;
      activeMenuId = (activeMenuId === mid) ? null : mid;
      dismissCoach();
      render();
      return;
    }
    if (activeMenuId || confirmingDeleteId) { activeMenuId = null; confirmingDeleteId = null; render(); }
  });
}

// login form — one name + one code, entered once. Logs you in if the account
// exists, or creates it if you're new (same flow as the slime game).
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('login-error'); err.classList.add('hidden');
  const name = $('login-username').value, code = $('login-code').value;
  const btn = $('login-btn'); btn.disabled = true; const orig = btn.textContent; btn.textContent = 'one sec…';
  try {
    const prof = await signInOrCreate(name, code);
    await startChat(prof);
  }
  catch (e2) { err.textContent = e2.message || 'Login failed.'; err.classList.remove('hidden'); }
  finally { btn.disabled = false; btn.textContent = orig; }
});

// already logged in?
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    const prof = await fetchProfile(session.user.id);
    if (prof) { await startChat(prof); return; }
  }
  $('view-login').classList.remove('hidden');
})();
