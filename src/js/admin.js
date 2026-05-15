import { createClient } from '@supabase/supabase-js';

const ADMIN_PASSWORD = 'dobrobut2024';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let activeSid = null;
let sessions = {};
let adminChannel = null;

// ─── AUTH ───────────────────────────────────────────────
window.checkPw = function () {
  const inp = document.getElementById('pw-inp');
  if (!inp) return;
  if (inp.value === ADMIN_PASSWORD) {
    localStorage.setItem('admin_auth', '1');
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('admin-app').style.display = 'flex';
    initAdmin();
  } else {
    inp.style.borderColor = '#ff3b30';
    setTimeout(() => { inp.style.borderColor = ''; }, 1200);
    inp.value = '';
  }
};

document.getElementById('pw-inp')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') window.checkPw();
});

if (localStorage.getItem('admin_auth') === '1') {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('admin-app').style.display = 'flex';
  initAdmin();
}

// ─── CORE ───────────────────────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })
    + ' ' + d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

function shortSid(sid) {
  return sid.slice(0, 8) + '...';
}

async function initAdmin() {
  await loadAllSessions();
  subscribeAll();
}

async function loadAllSessions() {
  const { data } = await sb
    .from('chat_messages')
    .select('*')
    .order('created_at', { ascending: true });
  if (!data) return;
  sessions = {};
  data.forEach(msg => {
    if (!sessions[msg.session_id]) sessions[msg.session_id] = [];
    sessions[msg.session_id].push(msg);
  });
  renderSessions();
}

function renderSessions() {
  const list = document.getElementById('sessions-list');
  if (!list) return;
  const sids = Object.keys(sessions).sort((a, b) => {
    const la = sessions[a].at(-1)?.created_at || '';
    const lb = sessions[b].at(-1)?.created_at || '';
    return lb.localeCompare(la);
  });
  if (!sids.length) {
    list.innerHTML = '<div class="no-chats">Повідомлень ще немає</div>';
    return;
  }
  list.innerHTML = sids.map(sid => {
    const msgs = sessions[sid];
    const last = msgs.at(-1);
    const unread = msgs.filter(m => m.sender === 'user' && !m._read).length;
    const active = sid === activeSid ? ' session-active' : '';
    const badge = unread ? `<span class="s-badge">${unread}</span>` : '';
    return `<div class="session-item${active}" onclick="selectSession('${sid}')">
      <div class="s-top"><span class="s-id">#${shortSid(sid)}</span>${badge}</div>
      <div class="s-last">${last.file_url ? '📎 Файл' : escHtml((last.text || '').slice(0, 50)) + ((last.text || '').length > 50 ? '…' : '')}</div>
      <div class="s-time">${fmtTime(last.created_at)}</div>
    </div>`;
  }).join('');
}

window.selectSession = function (sid) {
  activeSid = sid;
  if (sessions[sid]) sessions[sid].forEach(m => m._read = true);
  renderSessions();
  renderChat();
  document.getElementById('admin-reply-wrap').style.display = 'flex';
  setTimeout(() => document.getElementById('admin-inp')?.focus(), 100);
};

function renderChat() {
  const el = document.getElementById('admin-msgs');
  if (!el || !activeSid) return;
  const msgs = sessions[activeSid] || [];
  if (!msgs.length) {
    el.innerHTML = '<div class="no-msgs">Немає повідомлень</div>';
    return;
  }
  el.innerHTML = msgs.map(m => {
    let content = '';
    if (m.file_url) {
      const isImg = /\.(jpe?g|png|gif|webp|svg)(\?|$)/i.test(m.file_url);
      content += isImg
        ? `<img src="${m.file_url}" style="max-width:100%;max-height:180px;border-radius:8px;display:block;cursor:pointer" onclick="window.open('${m.file_url}','_blank')">`
        : `<a href="${m.file_url}" target="_blank" style="color:inherit;text-decoration:underline">📎 ${escHtml(decodeURIComponent(m.file_url.split('/').pop().split('?')[0]))}</a>`;
    }
    if (m.text) content += (content ? '<br>' : '') + escHtml(m.text);
    return `<div class="a-msg a-msg--${m.sender}">
      <div class="a-bubble">${content || '&nbsp;'}</div>
      <div class="a-time">${fmtTime(m.created_at)}</div>
    </div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

window.sendAdminMsg = async function () {
  if (!activeSid) return;
  const inp = document.getElementById('admin-inp');
  if (!inp) return;
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  const { error } = await sb.from('chat_messages').insert({
    session_id: activeSid,
    sender: 'admin',
    text,
  });
  if (error) console.error('[admin]', error);
};

document.getElementById('admin-inp')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') window.sendAdminMsg();
});

function subscribeAll() {
  if (adminChannel) return;
  adminChannel = sb
    .channel('admin_all')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'chat_messages',
    }, ({ new: msg }) => {
      if (!sessions[msg.session_id]) sessions[msg.session_id] = [];
      sessions[msg.session_id].push(msg);
      if (msg.session_id !== activeSid) {
        // mark as unread only for non-active session and non-admin
        if (msg.sender === 'user') msg._read = false;
      } else {
        msg._read = true;
        renderChat();
      }
      renderSessions();
    })
    .subscribe();
}

window.logout = function () {
  localStorage.removeItem('admin_auth');
  location.reload();
};
