import { supabase } from './supabase.js';
import '../css/chat-support.css';

const SESSION_ID = (() => {
  let id = localStorage.getItem('sup_session');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('sup_session', id); }
  return id;
})();

// localStorage key for last-read timestamp
const LAST_READ_KEY = 'sup_last_read_' + SESSION_ID;

let isOpen  = false;
let loaded  = false;
let channel = null;
let _unread = 0;
const rendered = new Set();

// ─── HELPERS ──────────────────────────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

function isLoggedIn() {
  return typeof window.getLoginState === 'function' && window.getLoginState() === true;
}

function getLastRead() {
  return localStorage.getItem(LAST_READ_KEY) || '';
}

function markAllRead() {
  localStorage.setItem(LAST_READ_KEY, new Date().toISOString());
  _unread = 0;
  updateBadge();
}

function buildBubble(msg) {
  let html = '';
  if (msg.file_url) {
    const isImg = /\.(jpe?g|png|gif|webp|svg)(\?|$)/i.test(msg.file_url);
    if (isImg) {
      html += `<img src="${msg.file_url}" class="sup-img" alt="файл" onclick="window.open('${msg.file_url}','_blank')">`;
    } else {
      const name = decodeURIComponent(msg.file_url.split('/').pop().split('?')[0]);
      html += `<a href="${msg.file_url}" target="_blank" class="sup-file-link">📎 ${escHtml(name)}</a>`;
    }
  }
  if (msg.text) html += (html ? '<br>' : '') + escHtml(msg.text);
  return html || '&nbsp;';
}

// ─── RENDER ───────────────────────────────────────────────────
function getMsgsEl() { return document.getElementById('sup-msgs'); }

function clearPlaceholder() {
  getMsgsEl()?.querySelector('.sup-empty, .sup-loading')?.remove();
}

function appendMsg(msg) {
  const el = getMsgsEl();
  if (!el) return;
  clearPlaceholder();
  const div = document.createElement('div');
  div.className = `sup-msg sup-msg--${msg.sender}`;
  div.dataset.msgId = String(msg.id ?? '');
  div.innerHTML = `<div class="sup-bubble">${buildBubble(msg)}</div><div class="sup-time">${fmtTime(msg.created_at)}</div>`;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

function showGuestBlock() {
  const el = getMsgsEl();
  if (!el) return;
  el.innerHTML = `<div class="sup-guest">
    <div class="sup-guest-ico">💬</div>
    <div class="sup-guest-txt">Увійдіть в акаунт, щоб написати у підтримку</div>
    <button class="sup-guest-btn" onclick="closeAllPanels();openPanel('acc-panel');renderAcc()">Увійти</button>
  </div>`;
  const row = document.getElementById('sup-inp-row');
  if (row) row.style.display = 'none';
}

function showInputRow() {
  const row = document.getElementById('sup-inp-row');
  if (row) row.style.display = '';
}

// ─── LOAD ─────────────────────────────────────────────────────
async function loadMsgs() {
  if (!supabase || loaded) return;
  loaded = true;
  const el = getMsgsEl();
  if (!el) return;
  el.innerHTML = '<div class="sup-loading">Завантаження...</div>';
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', SESSION_ID)
    .order('created_at', { ascending: true });
  el.innerHTML = '';
  if (error) {
    el.innerHTML = '<div class="sup-empty">Помилка завантаження. Спробуйте ще раз.</div>';
    loaded = false;
    return;
  }
  if (!data?.length) {
    el.innerHTML = '<div class="sup-empty">Напишіть своє питання —<br>ми відповімо якнайшвидше.</div>';
    return;
  }
  data.forEach(msg => { rendered.add(msg.id); appendMsg(msg); });
}

// ─── CHECK UNREAD ON LOAD ─────────────────────────────────────
// Count admin messages newer than the last-read timestamp and show badge on load.
async function checkUnreadOnLoad() {
  if (!supabase) return;
  const lastRead = getLastRead();
  let q = supabase
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', SESSION_ID)
    .eq('sender', 'admin');
  if (lastRead) q = q.gt('created_at', lastRead);
  const { count } = await q;
  _unread = count || 0;
  updateBadge();
}

// ─── REALTIME ─────────────────────────────────────────────────
function subscribeRealtime() {
  if (!supabase || channel) return;
  channel = supabase
    .channel('sup_' + SESSION_ID)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'chat_messages',
      filter: `session_id=eq.${SESSION_ID}`,
    }, ({ new: msg }) => {
      if (rendered.has(msg.id)) return;
      rendered.add(msg.id);
      // Only append if panel is open (avoid duplicates on re-open)
      if (isOpen) {
        appendMsg(msg);
        if (msg.sender === 'admin') markAllRead();
      } else if (msg.sender === 'admin') {
        _unread++;
        updateBadge();
      }
    })
    .subscribe();
}

// ─── BADGE ────────────────────────────────────────────────────
function updateBadge() {
  // Desktop floating widget badge
  const elNotif = document.getElementById('sup-notif');
  if (elNotif) {
    if (_unread > 0) { elNotif.textContent = _unread; elNotif.style.display = 'flex'; }
    else elNotif.style.display = 'none';
  }
  // Mobile nav badge
  const elMob = document.getElementById('mob-chat-badge');
  if (elMob) {
    if (_unread > 0) { elMob.textContent = _unread; elMob.style.display = 'flex'; }
    else elMob.style.display = 'none';
  }
}

// ─── PATCH closeAllPanels to track isOpen ─────────────────────
// main.js runs before this module, so closeAllPanels is already on window.
(function patchClose() {
  const _orig = window.closeAllPanels;
  window.closeAllPanels = function() {
    isOpen = false;
    if (_orig) _orig.apply(this, arguments);
  };
})();

// ─── CORE ACTIVATE (used by openSupportChat & switchChatTab) ──
window._supChatActivate = function () {
  isOpen = true;
  markAllRead();

  if (!isLoggedIn()) {
    showGuestBlock();
    return;
  }

  showInputRow();
  loadMsgs();
  subscribeRealtime();
  setTimeout(() => document.getElementById('sup-inp')?.focus(), 300);
};

// ─── PUBLIC API ───────────────────────────────────────────────
window.openSupportChat = function () {
  if (typeof window.closeAllPanels === 'function') window.closeAllPanels(false);
  document.getElementById('support-panel')?.classList.add('open');
  document.getElementById('ovl')?.classList.add('open');
  window._supChatActivate();
};

window.sendSupportMsg = async function () {
  if (!supabase || !isLoggedIn()) return;
  const inp = document.getElementById('sup-inp');
  if (!inp) return;
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';

  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ session_id: SESSION_ID, sender: 'user', text })
    .select()
    .single();

  if (error) {
    inp.value = text;
    console.error('[support-chat]', error);
    if (typeof window.showToast === 'function') window.showToast('Помилка. Спробуйте ще раз.');
    return;
  }
  rendered.add(data.id);
  appendMsg(data);
};

window.handleSupportFile = async function (e) {
  if (!supabase || !isLoggedIn()) return;
  const file = e.target.files?.[0];
  if (!file) return;
  e.target.value = '';

  if (file.size > 10 * 1024 * 1024) {
    if (typeof window.showToast === 'function') window.showToast('Файл занадто великий (макс. 10 МБ)');
    return;
  }

  const el = getMsgsEl();
  const spin = document.createElement('div');
  spin.className = 'sup-msg sup-msg--user';
  spin.id = 'sup-upload-spin';
  spin.innerHTML = '<div class="sup-bubble sup-uploading">Завантаження файлу...</div>';
  el?.appendChild(spin);
  if (el) el.scrollTop = el.scrollHeight;

  const ext = file.name.split('.').pop();
  const path = `${SESSION_ID}/${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage.from('chat-files').upload(path, file);
  document.getElementById('sup-upload-spin')?.remove();

  if (upErr) {
    console.error('[support-chat upload]', upErr);
    if (typeof window.showToast === 'function') window.showToast('Помилка завантаження файлу');
    return;
  }

  const { data: { publicUrl } } = supabase.storage.from('chat-files').getPublicUrl(path);
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ session_id: SESSION_ID, sender: 'user', text: '', file_url: publicUrl })
    .select()
    .single();

  if (error) { console.error('[support-chat]', error); return; }
  rendered.add(data.id);
  appendMsg(data);
};

document.addEventListener('DOMContentLoaded', () => {
  if (!supabase) return;
  subscribeRealtime();
  checkUnreadOnLoad();
});
