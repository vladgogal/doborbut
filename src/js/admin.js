import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://vuqbmffaoqokvcdprtmj.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_TANL3Q-By6iFobl08CGP6w_7E5onJ5n';
const ADMIN_EMAIL = 'burialoleg61@gmail.com';
const STORAGE_BUCKET = 'store-images';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── STATE ───────────────────────────────────────────────
let currentPage = 'dashboard';
let allCategories = [];   // full list for dropdowns
let allProducts = [];
let prodPage = 1;
const PROD_PER_PAGE = 20;
let selectedProdIds = new Set();
let editingProdId = null;
let editingCatId = null;
let selectedCatIds = new Set(); // for product category multiselect
let dragSrcId = null;

// chat state
let activeSid = null;
let sessions = {};
let adminChannel = null;

// ─── AUTH ─────────────────────────────────────────────────
window.signIn = async function () {
  const emailEl = document.getElementById('email-inp');
  const pwEl = document.getElementById('pw-inp');
  const btn = document.getElementById('auth-btn');
  const errEl = document.getElementById('auth-err');
  errEl.textContent = '';
  [emailEl, pwEl].forEach(el => el.classList.remove('err'));

  const email = emailEl.value.trim();
  const pw = pwEl.value;
  if (!email || !pw) {
    errEl.textContent = 'Введіть email і пароль';
    if (!email) emailEl.classList.add('err');
    if (!pw) pwEl.classList.add('err');
    return;
  }

  const resetBtn = () => {
    btn.disabled = false;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Увійти';
  };

  btn.disabled = true;
  btn.textContent = 'Вхід...';

  let data, error;
  try {
    ({ data, error } = await sb.auth.signInWithPassword({ email, password: pw }));
  } catch (e) {
    resetBtn();
    errEl.textContent = 'Помилка мережі: ' + (e.message || 'перевірте інтернет-з\'єднання');
    return;
  }

  resetBtn();

  if (error) {
    pwEl.classList.add('err');
    const msg = error.message || '';
    if (msg.includes('Invalid') || msg.includes('invalid') || msg.includes('credentials')) {
      errEl.textContent = 'Невірний email або пароль';
    } else if (msg.includes('Email not confirmed')) {
      errEl.textContent = 'Email не підтверджено — перевірте пошту та підтвердіть акаунт';
    } else {
      errEl.textContent = msg || 'Помилка входу';
    }
    return;
  }
  if (!data?.user) {
    errEl.textContent = 'Не вдалося отримати дані користувача';
    return;
  }
  if (data.user.email !== ADMIN_EMAIL) {
    await sb.auth.signOut();
    errEl.textContent = 'Доступ заборонено. Тільки адміністратор може увійти.';
    return;
  }
  showAdminApp(data.user);
};

window.signOut = async function () {
  if (adminChannel) { sb.removeChannel(adminChannel); adminChannel = null; }
  await sb.auth.signOut();
  document.getElementById('admin-app').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('auth-screen').style.flex = '1';
  document.getElementById('pw-inp').value = '';
  document.getElementById('auth-err').textContent = '';
  sessions = {}; activeSid = null; allCategories = []; allProducts = [];
};

// restore session on load
sb.auth.getSession().then(({ data: { session } }) => {
  if (session?.user?.email === ADMIN_EMAIL) showAdminApp(session.user);
});

function showAdminApp(user) {
  document.getElementById('auth-screen').style.display = 'none';
  const app = document.getElementById('admin-app');
  app.style.display = 'flex';
  app.style.flex = '1';
  app.style.overflow = 'hidden';
  const emailEl = document.getElementById('sb-email');
  if (emailEl) emailEl.textContent = user.email;
  initAdmin();
}

// ─── INIT ─────────────────────────────────────────────────
async function initAdmin() {
  await Promise.all([loadCategories(), loadChatSessions()]);
  subscribeChats();
  loadDashboard();
  checkDbSetup();
}

async function checkDbSetup() {
  const { error } = await sb.from('categories').select('id').limit(1);
  if (error && error.code === '42P01') {
    showSetupToast();
  }
}

function showSetupToast() {
  toast('⚠️ Потрібне налаштування БД — відкрийте Supabase SQL Editor', 'error', 8000);
}

// ─── NAVIGATION ───────────────────────────────────────────
const PAGE_TITLES = { dashboard: 'Дашборд', products: 'Товари', categories: 'Категорії', banners: 'Банери слайдера', orders: 'Замовлення', chats: 'Чати' };

window.showPage = function (page) {
  currentPage = page;
  document.querySelectorAll('.adm-page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (el) el.classList.add('active');

  document.querySelectorAll('.nav-btn, .mob-nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  setText('topbar-title', PAGE_TITLES[page] || page);

  if (page === 'products') loadProducts();
  else if (page === 'categories') renderCategoryTree();
  else if (page === 'banners') loadBanners();
  else if (page === 'orders') loadOrders();
  else if (page === 'dashboard') loadDashboard();
  else if (page === 'chats' && window.innerWidth <= 768 && !activeSid) showSessionsList();

  closeSidebar();
};

window.openSidebar = function () {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sb-overlay').classList.add('open');
};
window.closeSidebar = function () {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sb-overlay').classList.remove('open');
};

// ─── DASHBOARD ────────────────────────────────────────────
async function loadDashboard() {
  const [prodsRes, catsRes, ordersRes] = await Promise.all([
    sb.from('products').select('id', { count: 'exact', head: true }),
    sb.from('categories').select('id', { count: 'exact', head: true }),
    sb.from('orders').select('id', { count: 'exact', head: true }),
  ]);

  setText('stat-products', prodsRes.count ?? '—');
  setText('stat-cats', catsRes.count ?? '—');
  setText('stat-orders', ordersRes.count ?? '—');

  const unread = Object.values(sessions).flat().filter(m => m.sender === 'user' && !m._read).length;
  setText('stat-unread', unread);

  // Recent chats
  const dashEl = document.getElementById('dash-chats');
  if (!dashEl) return;
  const sids = Object.keys(sessions).sort((a, b) => {
    return (sessions[b].at(-1)?.created_at || '') > (sessions[a].at(-1)?.created_at || '') ? 1 : -1;
  }).slice(0, 5);

  if (!sids.length) {
    dashEl.innerHTML = '<div class="tbl-loading">Чатів ще немає</div>';
    return;
  }

  dashEl.innerHTML = sids.map(sid => {
    const last = sessions[sid].at(-1);
    const unreadCnt = sessions[sid].filter(m => m.sender === 'user' && !m._read).length;
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--gl2);cursor:pointer" onclick="showPage('chats');selectSession('${sid}')">
      <div style="width:34px;height:34px;background:var(--bg);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0">👤</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:700">#${sid.slice(0, 8)}</div>
        <div style="font-size:11px;color:var(--gt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(last.text || '📎 Файл').slice(0, 50)}</div>
      </div>
      <div style="font-size:11px;color:var(--gt);flex-shrink:0">${fmtTime(last.created_at)}</div>
      ${unreadCnt ? `<span style="background:var(--red);color:#fff;font-size:9px;font-weight:700;padding:2px 6px;border-radius:10px">${unreadCnt}</span>` : ''}
    </div>`;
  }).join('');
}

// ─── CATEGORIES ───────────────────────────────────────────
async function loadCategories() {
  const { data, error } = await sb.from('categories').select('*').order('sort_order').order('created_at');
  if (error) { allCategories = []; return; }
  allCategories = data || [];
  populateCatSelects();
  updateCatBadge();
}

function updateCatBadge() {
  const cnt = allCategories.length;
  const el = document.getElementById('nb-categories');
  if (el) { el.textContent = cnt; el.style.display = cnt ? 'inline-flex' : 'none'; }
  setText('cat-count-lbl', `${cnt} категорій`);
}

function populateCatSelects() {
  // Product filter dropdown
  const flt = document.getElementById('flt-prod-cat');
  if (flt) {
    const val = flt.value;
    flt.innerHTML = '<option value="">Всі категорії</option>' +
      allCategories.map(c => `<option value="${c.id}">${'—'.repeat(getCatLevel(c.id))} ${esc(c.name)}</option>`).join('');
    flt.value = val;
  }
  // Category parent select
  ['cat-parent'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const val = sel.value;
    sel.innerHTML = '<option value="">— Головна категорія —</option>' +
      allCategories
        .filter(c => !c.parent_id && c.id !== editingCatId)
        .map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    sel.value = val;
  });
}

function getCatLevel(id, depth = 0) {
  const cat = allCategories.find(c => c.id === id);
  if (!cat || !cat.parent_id || depth > 5) return depth;
  return getCatLevel(cat.parent_id, depth + 1);
}

function getCatProductCount(catId) {
  return allProducts.filter(p => p._catIds?.includes(catId)).length;
}

window.renderCategoryTree = function (filter = '') {
  const el = document.getElementById('cat-tree');
  if (!el) return;

  let cats = allCategories;
  if (filter) cats = cats.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()) || c.slug?.includes(filter));

  if (!cats.length) {
    el.innerHTML = allCategories.length === 0
      ? renderSetupCard('categories')
      : '<div class="tbl-loading">Нічого не знайдено</div>';
    return;
  }

  const roots = cats.filter(c => !c.parent_id);
  const html = roots.map(c => renderCatCard(c, cats)).join('');
  el.innerHTML = '<div class="cat-tree">' + html + '</div>';

  // drag-and-drop
  el.querySelectorAll('.cat-row[data-id]').forEach(row => {
    row.setAttribute('draggable', 'true');
    row.addEventListener('dragstart', e => { dragSrcId = row.dataset.id; row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    row.addEventListener('dragend', () => { row.classList.remove('dragging'); el.querySelectorAll('.drag-over').forEach(r => r.classList.remove('drag-over')); });
    row.addEventListener('dragover', e => { e.preventDefault(); row.classList.add('drag-over'); });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', async e => {
      e.preventDefault();
      row.classList.remove('drag-over');
      if (dragSrcId && dragSrcId !== row.dataset.id) await swapCatOrder(dragSrcId, row.dataset.id);
    });
  });
};

function renderCatCard(cat, allCats) {
  const children = allCats.filter(c => c.parent_id === cat.id);
  const cnt = getCatProductCount(cat.id);
  const img = cat.image_url
    ? `<img src="${esc(cat.image_url)}" alt="" onerror="this.style.display='none'">`
    : `<span style="font-size:18px">📁</span>`;

  return `<div class="cat-row" data-id="${cat.id}">
    <div class="cat-row-inner">
      <span class="cat-drag-handle" title="Перетягніть для сортування">⠿</span>
      <div class="cat-thumb">${img}</div>
      <div class="cat-info">
        <div class="cat-name">
          ${esc(cat.name)}
          ${!cat.is_active ? '<span style="background:#fef2f2;color:var(--red);font-size:9px;font-weight:700;padding:1px 6px;border-radius:6px">ПРИХОВАНА</span>' : ''}
        </div>
        <div class="cat-slug">/${esc(cat.slug || '')}</div>
      </div>
      <span class="cat-count">${cnt} товарів</span>
      <label class="tgl" title="${cat.is_active ? 'Деактивувати' : 'Активувати'}">
        <input type="checkbox" ${cat.is_active ? 'checked' : ''} onchange="toggleCatActive('${cat.id}',this.checked)">
        <span class="tgl-slider"></span>
      </label>
      <div class="cat-actions">
        <button class="btn-icon" title="Редагувати" onclick="openCategoryModal('${cat.id}')"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="btn-icon danger" title="Видалити" onclick="deleteCategory('${cat.id}')"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
      </div>
    </div>
    ${children.length ? `<div class="sub-cats">${children.map(ch => renderSubCat(ch)).join('')}</div>` : ''}
  </div>`;
}

function renderSubCat(cat) {
  const cnt = getCatProductCount(cat.id);
  const img = cat.image_url
    ? `<img src="${esc(cat.image_url)}" alt="" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`
    : `<span style="font-size:14px">📄</span>`;
  return `<div class="sub-cat-row">
    <div class="cat-thumb" style="width:32px;height:32px">${img}</div>
    <div class="sub-cat-info">
      <div class="sub-cat-name">${esc(cat.name)}${!cat.is_active ? ' <span style="color:var(--red);font-size:10px">(прихована)</span>' : ''}</div>
      <div class="sub-cat-slug">/${esc(cat.slug || '')}</div>
    </div>
    <span class="sub-cat-count">${cnt} товарів</span>
    <label class="tgl"><input type="checkbox" ${cat.is_active ? 'checked' : ''} onchange="toggleCatActive('${cat.id}',this.checked)"><span class="tgl-slider"></span></label>
    <button class="btn-icon" onclick="openCategoryModal('${cat.id}')"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
    <button class="btn-icon danger" onclick="deleteCategory('${cat.id}')"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
  </div>`;
}

window.filterCatList = function (val) {
  renderCategoryTree(val);
};

window.toggleCatActive = async function (id, active) {
  const { error } = await sb.from('categories').update({ is_active: active }).eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  const cat = allCategories.find(c => c.id === id);
  if (cat) cat.is_active = active;
  toast(active ? '✅ Категорія активована' : '🔒 Категорія прихована');
};

async function swapCatOrder(id1, id2) {
  const c1 = allCategories.find(c => c.id === id1);
  const c2 = allCategories.find(c => c.id === id2);
  if (!c1 || !c2) return;
  const [o1, o2] = [c1.sort_order, c2.sort_order];
  c1.sort_order = o2; c2.sort_order = o1;
  await Promise.all([
    sb.from('categories').update({ sort_order: o2 }).eq('id', id1),
    sb.from('categories').update({ sort_order: o1 }).eq('id', id2),
  ]);
  renderCategoryTree();
}

// ─── CATEGORY MODAL ───────────────────────────────────────
let catImgFile = null;
let catImgUrl = '';

window.openCategoryModal = async function (id) {
  editingCatId = id || null;
  catImgFile = null; catImgUrl = '';
  setText('cat-modal-title', id ? 'Редагувати категорію' : 'Нова категорія');

  // reset form
  ['cat-name','cat-slug','cat-desc','cat-seo-title','cat-seo-desc'].forEach(f => { const el = document.getElementById(f); if (el) el.value = ''; });
  document.getElementById('cat-active').checked = true;
  setCatImagePreview('');
  switchCatTab('main', document.querySelector('#cat-modal .mtab'));

  populateCatSelects();

  if (id) {
    const { data } = await sb.from('categories').select('*').eq('id', id).single();
    if (data) {
      document.getElementById('cat-name').value = data.name || '';
      document.getElementById('cat-slug').value = data.slug || '';
      document.getElementById('cat-desc').value = data.description || '';
      document.getElementById('cat-active').checked = data.is_active !== false;
      document.getElementById('cat-parent').value = data.parent_id || '';
      document.getElementById('cat-seo-title').value = data.seo_title || '';
      document.getElementById('cat-seo-desc').value = data.seo_description || '';
      catImgUrl = data.image_url || '';
      setCatImagePreview(catImgUrl);
      const urlInp = document.getElementById('cat-img-url');
      if (urlInp) urlInp.value = catImgUrl;
    }
  }

  openModal('cat-modal');
  setTimeout(() => document.getElementById('cat-name')?.focus(), 120);
};

window.closeCatModal = function () { closeModal('cat-modal'); };

window.genCatSlug = function () {
  const name = document.getElementById('cat-name')?.value || '';
  const slug = slugify(name);
  const slugEl = document.getElementById('cat-slug');
  if (slugEl && (!slugEl.value || slugEl.dataset.auto === '1')) {
    slugEl.value = slug;
    slugEl.dataset.auto = '1';
  }
};

window.onCatImgUrl = function (val) {
  catImgUrl = val;
  catImgFile = null;
  setCatImagePreview(val);
};

window.onCatImgFile = function (input) {
  const file = input.files[0];
  if (!file) return;
  catImgFile = file;
  const reader = new FileReader();
  reader.onload = e => setCatImagePreview(e.target.result);
  reader.readAsDataURL(file);
};

window.removeCatImage = function (e) {
  e.stopPropagation();
  catImgFile = null; catImgUrl = '';
  setCatImagePreview('');
  const urlInp = document.getElementById('cat-img-url');
  if (urlInp) urlInp.value = '';
};

function setCatImagePreview(src) {
  const img = document.getElementById('cat-img-preview-img');
  const ph = document.getElementById('cat-img-placeholder');
  const rm = document.getElementById('cat-img-remove');
  if (!img) return;
  if (src) {
    img.src = src; img.style.display = 'block';
    if (ph) ph.style.display = 'none';
    if (rm) rm.style.display = 'flex';
  } else {
    img.src = ''; img.style.display = 'none';
    if (ph) ph.style.display = 'flex';
    if (rm) rm.style.display = 'none';
  }
}

window.switchCatTab = function (tab, btn) {
  document.querySelectorAll('#cat-modal .mtab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('ctab-main').style.display = tab === 'main' ? 'block' : 'none';
  document.getElementById('ctab-seo').style.display = tab === 'seo' ? 'block' : 'none';
};

window.saveCategory = async function () {
  const name = document.getElementById('cat-name')?.value.trim();
  const slug = document.getElementById('cat-slug')?.value.trim();
  if (!name || !slug) { toast('Введіть назву та slug', 'error'); return; }

  const btn = document.getElementById('cat-save-btn');
  btn.disabled = true; btn.textContent = 'Збереження...';

  try {
    // Upload image if file selected
    let finalImageUrl = catImgUrl;
    if (catImgFile) {
      finalImageUrl = await uploadImage(catImgFile, 'categories');
      if (finalImageUrl === null) return; // storage not set up — modal shown by uploadImage
    }

    const payload = {
      name, slug,
      description: document.getElementById('cat-desc')?.value.trim() || null,
      image_url: finalImageUrl || null,
      parent_id: document.getElementById('cat-parent')?.value || null,
      is_active: document.getElementById('cat-active')?.checked ?? true,
      seo_title: document.getElementById('cat-seo-title')?.value.trim() || null,
      seo_description: document.getElementById('cat-seo-desc')?.value.trim() || null,
    };

    let error;
    if (editingCatId) {
      ({ error } = await sb.from('categories').update(payload).eq('id', editingCatId));
    } else {
      ({ error } = await sb.from('categories').insert({ ...payload, sort_order: allCategories.length }));
    }

    if (error) { toast(error.message, 'error'); return; }

    toast(editingCatId ? '✅ Категорія оновлена' : '✅ Категорія створена', 'success');
    closeCatModal();
    await loadCategories();
    renderCategoryTree();
  } finally {
    btn.disabled = false; btn.textContent = 'Зберегти категорію';
  }
};

window.deleteCategory = async function (id) {
  const cat = allCategories.find(c => c.id === id);
  if (!confirm(`Видалити категорію "${cat?.name}"?\nТовари не видаляться, але втратять цю категорію.`)) return;
  const { error } = await sb.from('categories').delete().eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('🗑 Категорія видалена');
  await loadCategories();
  renderCategoryTree();
};

// ─── PRODUCTS ─────────────────────────────────────────────
let prodSearchTimer = null;

window.onProdSearch = function (val) {
  clearTimeout(prodSearchTimer);
  prodSearchTimer = setTimeout(() => { prodPage = 1; loadProducts(); }, 350);
};

window.resetProdFilters = function () {
  document.getElementById('flt-prod-search').value = '';
  document.getElementById('flt-prod-cat').value = '';
  document.getElementById('flt-prod-stock').value = '';
  document.getElementById('flt-prod-status').value = '';
  prodPage = 1;
  loadProducts();
};

async function loadProducts() {
  const tbody = document.getElementById('prod-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="tbl-loading">Завантаження...</td></tr>';

  const search = document.getElementById('flt-prod-search')?.value.trim() || '';
  const catId = document.getElementById('flt-prod-cat')?.value || '';
  const stock = document.getElementById('flt-prod-stock')?.value;
  const status = document.getElementById('flt-prod-status')?.value;

  const from = (prodPage - 1) * PROD_PER_PAGE;
  const to = from + PROD_PER_PAGE - 1;

  // Load product_categories for filtering if needed
  let allowedIds = null;
  if (catId) {
    const { data: pc } = await sb.from('product_categories').select('product_id').eq('category_id', catId);
    allowedIds = pc?.map(r => r.product_id) || [];
    if (!allowedIds.length) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="tbl-empty">Товарів у цій категорії немає</td></tr>';
      setText('prod-count-lbl', '0 товарів');
      setText('prod-pag', '');
      return;
    }
  }

  let query = sb.from('products').select('*', { count: 'exact' });

  if (search) query = query.ilike('name', `%${search}%`);
  if (stock !== '' && stock !== undefined) query = query.eq('in_stock', stock === 'true');
  if (status !== '' && status !== undefined) query = query.eq('is_active', status === 'true');
  if (allowedIds) query = query.in('id', allowedIds);

  query = query.order('created_at', { ascending: false }).range(from, to);

  const { data, count, error } = await query;

  if (error && error.code === '42P01') {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7">${renderSetupCard('products')}</td></tr>`;
    return;
  }

  allProducts = data || [];

  // Load category associations for these products
  if (allProducts.length) {
    const ids = allProducts.map(p => p.id);
    const { data: pcs } = await sb.from('product_categories')
      .select('product_id, category_id')
      .in('product_id', ids);
    const pcMap = {};
    (pcs || []).forEach(r => {
      if (!pcMap[r.product_id]) pcMap[r.product_id] = [];
      pcMap[r.product_id].push(r.category_id);
    });
    allProducts.forEach(p => { p._catIds = pcMap[p.id] || []; });
  }

  renderProdTable(allProducts);
  renderPagination(count || 0);

  const total = count || 0;
  setText('prod-count-lbl', `${total} товарів`);
  const nbEl = document.getElementById('nb-products');
  if (nbEl) { nbEl.textContent = total; nbEl.style.display = total ? 'inline-flex' : 'none'; }
}

function renderProdTable(prods) {
  const tbody = document.getElementById('prod-tbody');
  if (!tbody) return;
  if (!prods.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="tbl-empty">Товарів не знайдено</td></tr>';
    return;
  }
  tbody.innerHTML = prods.map(p => {
    const cats = (p._catIds || []).map(id => allCategories.find(c => c.id === id)?.name).filter(Boolean);
    const thumb = p.image_url
      ? `<div class="prod-thumb"><img src="${esc(p.image_url)}" alt="" onerror="this.parentElement.textContent='${esc(p.emoji||'📦')}'"></div>`
      : `<div class="prod-thumb">${esc(p.emoji || '📦')}</div>`;
    const checked = selectedProdIds.has(p.id) ? 'checked' : '';
    return `<tr>
      <td class="td-chk"><input type="checkbox" ${checked} onchange="toggleProdSel('${p.id}',this.checked)"></td>
      <td>
        <div class="prod-cell">
          ${thumb}
          <div>
            <div class="prod-name" title="${esc(p.name)}">${esc(p.name)}</div>
            ${p.sku ? `<div class="prod-sku">SKU: ${esc(p.sku)}</div>` : ''}
          </div>
        </div>
      </td>
      <td class="td-hide-sm"><div class="cat-chips">${cats.map(n => `<span class="cat-chip">${esc(n)}</span>`).join('') || '<span style="color:var(--gt);font-size:11px">—</span>'}</div></td>
      <td>
        <div style="font-size:14px;font-weight:800;white-space:nowrap">${p.price} грн</div>
        ${p.old_price ? `<div style="font-size:11px;color:var(--gt);text-decoration:line-through">${p.old_price} грн</div>` : ''}
      </td>
      <td class="td-hide-sm"><span class="badge ${p.in_stock ? 'badge-green' : 'badge-red'}">${p.in_stock ? 'В наявності' : 'Немає'}</span></td>
      <td class="td-hide-sm">
        <label class="tgl"><input type="checkbox" ${p.is_active ? 'checked' : ''} onchange="toggleProdActive('${p.id}',this.checked)"><span class="tgl-slider"></span></label>
      </td>
      <td class="td-act">
        <div class="td-act-wrap">
          <button class="btn-icon" onclick="openProductModal('${p.id}')"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="btn-icon danger" onclick="deleteProduct('${p.id}')"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function renderPagination(total) {
  const el = document.getElementById('prod-pag');
  if (!el) return;
  const pages = Math.ceil(total / PROD_PER_PAGE);
  if (pages <= 1) { el.innerHTML = ''; return; }
  const from = (prodPage - 1) * PROD_PER_PAGE + 1;
  const to = Math.min(prodPage * PROD_PER_PAGE, total);
  el.innerHTML = `<span>${from}–${to} з ${total}</span>
    <div class="pagination-btns">
      <button class="pag-btn" onclick="goPage(${prodPage - 1})" ${prodPage === 1 ? 'disabled' : ''}>‹</button>
      ${Array.from({ length: Math.min(pages, 7) }, (_, i) => {
        const p = prodPage <= 4 ? i + 1 : prodPage + i - 3;
        if (p < 1 || p > pages) return '';
        return `<button class="pag-btn ${p === prodPage ? 'active' : ''}" onclick="goPage(${p})">${p}</button>`;
      }).join('')}
      <button class="pag-btn" onclick="goPage(${prodPage + 1})" ${prodPage >= pages ? 'disabled' : ''}>›</button>
    </div>`;
}

window.goPage = function (p) { prodPage = p; loadProducts(); };

window.toggleProdActive = async function (id, active) {
  await sb.from('products').update({ is_active: active }).eq('id', id);
  const p = allProducts.find(pr => pr.id === id);
  if (p) p.is_active = active;
};

// ── Bulk ──
window.toggleProdSel = function (id, checked) {
  if (checked) selectedProdIds.add(id); else selectedProdIds.delete(id);
  updateBulkBar();
};
window.selectAll = function (checked) {
  allProducts.forEach(p => { if (checked) selectedProdIds.add(p.id); else selectedProdIds.delete(p.id); });
  document.querySelectorAll('#prod-tbody input[type=checkbox]').forEach(c => c.checked = checked);
  updateBulkBar();
};
function updateBulkBar() {
  const cnt = selectedProdIds.size;
  const bar = document.getElementById('bulk-bar');
  if (bar) bar.style.display = cnt ? 'flex' : 'none';
  setText('bulk-count', `${cnt} вибрано`);
  const chkAll = document.getElementById('chk-all');
  if (chkAll) chkAll.indeterminate = cnt > 0 && cnt < allProducts.length;
}
window.clearBulk = function () { selectedProdIds.clear(); updateBulkBar(); renderProdTable(allProducts); };
window.bulkDelete = async function () {
  if (!confirm(`Видалити ${selectedProdIds.size} товарів?`)) return;
  await sb.from('products').delete().in('id', [...selectedProdIds]);
  selectedProdIds.clear(); updateBulkBar();
  toast('🗑 Товари видалені');
  loadProducts();
};
window.bulkStock = async function (val) {
  await sb.from('products').update({ in_stock: val }).in('id', [...selectedProdIds]);
  selectedProdIds.clear(); updateBulkBar();
  toast(val ? '✅ Наявність оновлена' : '❌ Наявність оновлена');
  loadProducts();
};

// ─── PRODUCT MODAL ────────────────────────────────────────
let prodImgFile = null;
let prodImgUrl = '';

window.openProductModal = async function (id) {
  editingProdId = id || null;
  prodImgFile = null; prodImgUrl = '';
  selectedCatIds.clear();
  setText('prod-modal-title', id ? 'Редагувати товар' : 'Новий товар');

  ['prod-name','prod-price','prod-oldprice','prod-sku','prod-emoji','prod-desc','prod-slug','prod-seo-title','prod-seo-desc'].forEach(f => {
    const el = document.getElementById(f);
    if (el) el.value = '';
  });
  document.getElementById('prod-instock').checked = true;
  document.getElementById('prod-active').checked = true;
  setProdImagePreview('');
  switchProdTab('main', document.querySelector('#prod-modal .mtab'));
  renderCmsChips();

  if (id) {
    const { data: prod } = await sb.from('products').select('*').eq('id', id).single();
    if (prod) {
      document.getElementById('prod-name').value = prod.name || '';
      document.getElementById('prod-price').value = prod.price || '';
      document.getElementById('prod-oldprice').value = prod.old_price || '';
      document.getElementById('prod-sku').value = prod.sku || '';
      document.getElementById('prod-emoji').value = prod.emoji || '🌿';
      document.getElementById('prod-desc').value = prod.description || '';
      document.getElementById('prod-instock').checked = prod.in_stock !== false;
      document.getElementById('prod-active').checked = prod.is_active !== false;
      document.getElementById('prod-slug').value = prod.slug || '';
      document.getElementById('prod-seo-title').value = prod.seo_title || '';
      document.getElementById('prod-seo-desc').value = prod.seo_description || '';
      prodImgUrl = prod.image_url || '';
      setProdImagePreview(prodImgUrl);
      const urlInp = document.getElementById('prod-img-url');
      if (urlInp) urlInp.value = prodImgUrl;

      // Load product categories
      const { data: pc } = await sb.from('product_categories').select('category_id').eq('product_id', id);
      (pc || []).forEach(r => selectedCatIds.add(r.category_id));
      renderCmsChips();
    }
  }

  renderCmsOptions('');
  openModal('prod-modal');
  setTimeout(() => document.getElementById('prod-name')?.focus(), 120);
};

window.closeProdModal = function () { closeModal('prod-modal'); };

window.genProdSlug = function () {
  const name = document.getElementById('prod-name')?.value || '';
  const slugEl = document.getElementById('prod-slug');
  if (slugEl && (!slugEl.value || slugEl.dataset.auto === '1')) {
    slugEl.value = slugify(name);
    slugEl.dataset.auto = '1';
  }
};

window.onProdImgUrl = function (val) {
  prodImgUrl = val;
  prodImgFile = null;
  setProdImagePreview(val);
};

window.onProdImgFile = function (input) {
  const file = input.files[0];
  if (!file) return;
  prodImgFile = file;
  const reader = new FileReader();
  reader.onload = e => setProdImagePreview(e.target.result);
  reader.readAsDataURL(file);
};

window.removeProdImage = function (e) {
  e.stopPropagation();
  prodImgFile = null; prodImgUrl = '';
  setProdImagePreview('');
  const urlInp = document.getElementById('prod-img-url');
  if (urlInp) urlInp.value = '';
};

function setProdImagePreview(src) {
  const img = document.getElementById('prod-img-preview-img');
  const ph = document.getElementById('prod-img-placeholder');
  const rm = document.getElementById('prod-img-remove');
  if (!img) return;
  if (src) {
    img.src = src; img.style.display = 'block';
    if (ph) ph.style.display = 'none';
    if (rm) rm.style.display = 'flex';
  } else {
    img.src = ''; img.style.display = 'none';
    if (ph) ph.style.display = 'flex';
    if (rm) rm.style.display = 'none';
  }
}

window.switchProdTab = function (tab, btn) {
  document.querySelectorAll('#prod-modal .mtab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('ptab-main').style.display = tab === 'main' ? 'block' : 'none';
  document.getElementById('ptab-seo').style.display = tab === 'seo' ? 'block' : 'none';
};

window.saveProduct = async function () {
  const name = document.getElementById('prod-name')?.value.trim();
  const price = parseFloat(document.getElementById('prod-price')?.value) || 0;
  if (!name) { toast('Введіть назву товару', 'error'); return; }

  const btn = document.getElementById('prod-save-btn');
  btn.disabled = true; btn.textContent = 'Збереження...';

  try {
    let finalImageUrl = prodImgUrl;
    if (prodImgFile) {
      finalImageUrl = await uploadImage(prodImgFile, 'products');
      if (finalImageUrl === null) return; // storage not set up — modal shown by uploadImage
    }

    const payload = {
      name,
      price,
      old_price: parseFloat(document.getElementById('prod-oldprice')?.value) || null,
      sku: document.getElementById('prod-sku')?.value.trim() || null,
      emoji: document.getElementById('prod-emoji')?.value.trim() || '🌿',
      description: document.getElementById('prod-desc')?.value.trim() || null,
      image_url: finalImageUrl || null,
      in_stock: document.getElementById('prod-instock')?.checked ?? true,
      is_active: document.getElementById('prod-active')?.checked ?? true,
      slug: document.getElementById('prod-slug')?.value.trim() || null,
      seo_title: document.getElementById('prod-seo-title')?.value.trim() || null,
      seo_description: document.getElementById('prod-seo-desc')?.value.trim() || null,
    };

    let prodId = editingProdId;
    let error;

    if (editingProdId) {
      ({ error } = await sb.from('products').update(payload).eq('id', editingProdId));
    } else {
      const res = await sb.from('products').insert(payload).select('id').single();
      error = res.error;
      if (res.data) prodId = res.data.id;
    }

    if (error) { toast(error.message, 'error'); return; }

    // Save categories (many-to-many)
    if (prodId) {
      await sb.from('product_categories').delete().eq('product_id', prodId);
      if (selectedCatIds.size) {
        await sb.from('product_categories').insert(
          [...selectedCatIds].map(cat_id => ({ product_id: prodId, category_id: cat_id }))
        );
      }
    }

    toast(editingProdId ? '✅ Товар оновлено' : '✅ Товар додано', 'success');
    closeProdModal();
    loadProducts();
  } finally {
    btn.disabled = false; btn.textContent = 'Зберегти товар';
  }
};

window.deleteProduct = async function (id) {
  const prod = allProducts.find(p => p.id === id);
  if (!confirm(`Видалити товар "${prod?.name}"?`)) return;
  const { error } = await sb.from('products').delete().eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('🗑 Товар видалено');
  loadProducts();
};

// ─── CATEGORY MULTISELECT ─────────────────────────────────
window.toggleCmsDropdown = function () {
  const dd = document.getElementById('cms-dd');
  if (!dd) return;
  if (dd.style.display === 'none') openCmsDropdown();
  else closeCmsDropdown();
};

window.openCmsDropdown = function () {
  const dd = document.getElementById('cms-dd');
  const box = document.getElementById('cat-ms-box');
  if (dd) dd.style.display = 'block';
  if (box) box.classList.add('focused');
  renderCmsOptions(document.getElementById('cms-inp')?.value || '');
};

function closeCmsDropdown() {
  const dd = document.getElementById('cms-dd');
  const box = document.getElementById('cat-ms-box');
  if (dd) dd.style.display = 'none';
  if (box) box.classList.remove('focused');
}

window.filterCms = function (val) {
  openCmsDropdown();
  renderCmsOptions(val);
};

function renderCmsOptions(search) {
  const opts = document.getElementById('cms-opts');
  if (!opts) return;
  const cats = allCategories.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );
  if (!cats.length) {
    opts.innerHTML = `<div class="cms-empty">Нічого не знайдено</div>`;
    return;
  }
  opts.innerHTML = cats.map(c => {
    const level = getCatLevel(c.id);
    const sel = selectedCatIds.has(c.id);
    return `<div class="cms-opt ${sel ? 'selected' : ''}" onclick="toggleCmsOpt('${c.id}')">
      <span class="cms-opt-check">${sel ? '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' : ''}</span>
      <span class="cms-opt-name">${esc(c.name)}</span>
      ${level ? `<span class="cms-opt-indent">${'└'.repeat(level)}</span>` : ''}
    </div>`;
  }).join('');
}

window.toggleCmsOpt = function (id) {
  if (selectedCatIds.has(id)) selectedCatIds.delete(id);
  else selectedCatIds.add(id);
  renderCmsChips();
  renderCmsOptions(document.getElementById('cms-inp')?.value || '');
};

function renderCmsChips() {
  const el = document.getElementById('cms-chips');
  if (!el) return;
  if (!selectedCatIds.size) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = [...selectedCatIds].map(id => {
    const cat = allCategories.find(c => c.id === id);
    return cat ? `<span class="cms-chip">${esc(cat.name)}<button class="cms-chip-del" onclick="toggleCmsOpt('${id}')">×</button></span>` : '';
  }).join('');
}

window.quickCreateCat = async function () {
  const search = document.getElementById('cms-inp')?.value.trim();
  const name = search || prompt('Назва нової категорії:');
  if (!name) return;
  const slug = slugify(name);
  const { data, error } = await sb.from('categories').insert({ name, slug, is_active: true, sort_order: allCategories.length }).select('*').single();
  if (error) { toast(error.message, 'error'); return; }
  allCategories.push(data);
  selectedCatIds.add(data.id);
  populateCatSelects();
  renderCmsChips();
  renderCmsOptions('');
  if (document.getElementById('cms-inp')) document.getElementById('cms-inp').value = '';
  toast(`✅ Категорія "${name}" створена`, 'success');
};

// Close dropdown on outside click
document.addEventListener('click', e => {
  const ms = document.getElementById('cat-ms');
  if (ms && !ms.contains(e.target)) closeCmsDropdown();
});

// ─── ORDERS ───────────────────────────────────────────────
async function loadOrders() {
  const tbody = document.getElementById('orders-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" class="tbl-loading">Завантаження...</td></tr>';

  const { data, error } = await sb.from('orders').select('*').order('created_at', { ascending: false }).limit(100);

  if (error) {
    if (error.code === '42P01') {
      tbody.innerHTML = `<tr><td colspan="5">${renderSetupCard('orders')}</td></tr>`;
    } else {
      tbody.innerHTML = `<tr><td colspan="5" class="tbl-empty">${esc(error.message)}</td></tr>`;
    }
    return;
  }

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="tbl-empty">Замовлень ще немає</td></tr>';
    return;
  }

  const STATUS = { new: ['Новий', 'badge-blue'], processing: ['В обробці', 'badge-orange'], done: ['Виконано', 'badge-green'], cancelled: ['Скасовано', 'badge-red'] };
  tbody.innerHTML = data.map(o => {
    const [sLbl, sCss] = STATUS[o.status] || [o.status, 'badge-gray'];
    return `<tr>
      <td><div style="font-size:12px;font-weight:700">#${o.id.slice(0,8)}</div><div style="font-size:11px;color:var(--gt)">${fmtTime(o.created_at)}</div></td>
      <td class="td-hide-sm">${esc(o.customer_name || o.customer_phone || o.customer_email || '—')}</td>
      <td><b>${o.total ? o.total + ' грн' : '—'}</b></td>
      <td><span class="badge ${sCss}">${sLbl}</span></td>
      <td class="td-act"><div class="td-act-wrap">
        <select class="flt-sel" style="height:28px;font-size:11px" onchange="updateOrderStatus('${o.id}',this.value)">
          ${['new','processing','done','cancelled'].map(s => `<option value="${s}" ${o.status===s?'selected':''}>${STATUS[s][0]}</option>`).join('')}
        </select>
      </div></td>
    </tr>`;
  }).join('');
}

window.updateOrderStatus = async function (id, status) {
  await sb.from('orders').update({ status }).eq('id', id);
  toast('✅ Статус оновлено');
};

// ─── CHATS ────────────────────────────────────────────────

// Persist per-session read state in localStorage so unread count survives page reload.
function _admReadKey(sid) { return 'adm_rd_' + sid; }
function _getAdmRead(sid) { return localStorage.getItem(_admReadKey(sid)) || ''; }
function _setAdmRead(sid, ts) { if (ts) localStorage.setItem(_admReadKey(sid), ts); }

async function loadChatSessions() {
  const { data } = await sb.from('chat_messages').select('*').order('created_at', { ascending: true });
  if (!data) return;

  // Build sessions map first
  sessions = {};
  data.forEach(msg => {
    if (!sessions[msg.session_id]) sessions[msg.session_id] = [];
    sessions[msg.session_id].push(msg);
  });

  const sids = Object.keys(sessions);
  const hasAnyRecord = sids.some(sid => _getAdmRead(sid) !== '');

  if (!hasAnyRecord && sids.length > 0) {
    // First launch with new persistence code.
    // Mark every existing session fully read so old history doesn't flood the badge.
    sids.forEach(sid => {
      const msgs = sessions[sid];
      if (msgs.length) _setAdmRead(sid, msgs.at(-1).created_at);
      msgs.forEach(m => { m._read = true; });
    });
  } else {
    // Apply stored read markers per session.
    sids.forEach(sid => {
      const lastRead = _getAdmRead(sid);
      sessions[sid].forEach(m => {
        m._read = m.sender !== 'user' || (lastRead !== '' && m.created_at <= lastRead);
      });
    });
  }

  renderSessions();
  updateChatBadge();
}

function renderSessions() {
  const list = document.getElementById('sessions-list');
  if (!list) return;
  const sids = Object.keys(sessions).sort((a, b) =>
    (sessions[b].at(-1)?.created_at || '') > (sessions[a].at(-1)?.created_at || '') ? 1 : -1
  );
  setText('chat-sess-cnt', sids.length);
  if (!sids.length) { list.innerHTML = '<div class="no-chats">Повідомлень ще немає</div>'; return; }
  list.innerHTML = sids.map(sid => {
    const msgs = sessions[sid];
    const last = msgs.at(-1);
    const unread = msgs.filter(m => m.sender === 'user' && !m._read).length;
    return `<div class="session-item ${sid === activeSid ? 'session-active' : ''}" onclick="selectSession('${sid}')">
      <div class="s-top"><span class="s-id">#${sid.slice(0,8)}</span>${unread ? `<span class="s-badge">${unread}</span>` : ''}</div>
      <div class="s-last">${last.file_url ? '📎 Файл' : esc(last.text || '').slice(0, 52)}</div>
      <div class="s-time">${fmtTime(last.created_at)}</div>
    </div>`;
  }).join('');
}

window.selectSession = function (sid) {
  activeSid = sid;
  const msgs = sessions[sid] || [];
  // Persist read state: save the timestamp of the last message in this session.
  if (msgs.length) _setAdmRead(sid, msgs.at(-1).created_at);
  msgs.forEach(m => m._read = true);
  renderSessions();
  renderChat();
  updateChatBadge();
  document.getElementById('admin-reply-wrap').style.display = 'flex';
  setText('chat-hdr-txt', '#' + sid.slice(0, 8));
  setTimeout(() => document.getElementById('admin-inp')?.focus(), 80);

  if (window.innerWidth <= 768) {
    document.getElementById('sessions-pane')?.classList.add('has-active');
    document.getElementById('chat-main-pane')?.classList.remove('no-active');
  }
};

window.backToSessions = function () {
  activeSid = null;
  document.getElementById('sessions-pane')?.classList.remove('has-active');
  document.getElementById('chat-main-pane')?.classList.add('no-active');
  document.getElementById('admin-reply-wrap').style.display = 'none';
};

window.showSessionsList = function () {
  document.getElementById('sessions-pane')?.classList.remove('has-active');
  document.getElementById('chat-main-pane')?.classList.add('no-active');
};

function renderChat() {
  const el = document.getElementById('admin-msgs');
  if (!el || !activeSid) return;
  const msgs = sessions[activeSid] || [];
  if (!msgs.length) { el.innerHTML = '<div class="no-msgs">Немає повідомлень</div>'; return; }
  el.innerHTML = msgs.map(m => {
    let content = '';
    if (m.file_url) {
      const isImg = /\.(jpe?g|png|gif|webp|svg)(\?|$)/i.test(m.file_url);
      content += isImg
        ? `<img src="${m.file_url}" style="max-width:100%;max-height:180px;border-radius:8px;display:block;cursor:pointer" onclick="window.open('${m.file_url}','_blank')">`
        : `<a href="${m.file_url}" target="_blank" style="color:inherit;text-decoration:underline">📎 ${esc(decodeURIComponent(m.file_url.split('/').pop().split('?')[0]))}</a>`;
    }
    if (m.text) content += (content ? '<br>' : '') + esc(m.text);
    return `<div class="a-msg a-msg--${m.sender}"><div class="a-bubble">${content || '&nbsp;'}</div><div class="a-time">${fmtTime(m.created_at)}</div></div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

window.sendAdminMsg = async function () {
  if (!activeSid) return;
  const inp = document.getElementById('admin-inp');
  const text = inp?.value.trim();
  if (!text) return;
  inp.value = '';
  await sb.from('chat_messages').insert({ session_id: activeSid, sender: 'admin', text });
};

document.getElementById('admin-inp')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') window.sendAdminMsg();
});

function subscribeChats() {
  if (adminChannel) return;
  adminChannel = sb.channel('admin_all')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, ({ new: msg }) => {
      if (!sessions[msg.session_id]) sessions[msg.session_id] = [];
      sessions[msg.session_id].push(msg);
      if (msg.session_id === activeSid) {
        // Session is open — mark read immediately and persist.
        msg._read = true;
        _setAdmRead(activeSid, msg.created_at);
        renderChat();
      }
      renderSessions();
      updateChatBadge();
      if (currentPage === 'dashboard') loadDashboard();
    }).subscribe();
}

function updateChatBadge() {
  const cnt = Object.values(sessions).flat().filter(m => m.sender === 'user' && !m._read).length;
  ['nb-chats', 'mob-chat-badge'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = cnt;
    el.style.display = cnt ? 'inline-flex' : 'none';
  });
}

// ─── IMAGE UPLOAD ─────────────────────────────────────────
async function ensureStorageBucket() {
  const { error } = await sb.storage.createBucket(STORAGE_BUCKET, {
    public: true,
    fileSizeLimit: 10485760,
  });
  // 'Duplicate' / 'already exists' means bucket is already there — that's fine.
  return !error || /duplicate|already exists/i.test(error.message || '');
}

async function uploadImage(file, folder) {
  const ext = file.name.split('.').pop();
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const doUpload = () => sb.storage.from(STORAGE_BUCKET).upload(path, file, { cacheControl: '3600', upsert: false });

  let { data, error } = await doUpload();

  if (error) {
    // Bucket might not exist — try to create it then retry once.
    const ok = await ensureStorageBucket();
    if (ok) {
      ({ data, error } = await doUpload());
    }
  }

  if (error) {
    console.warn('[admin] Storage upload failed:', error.message);
    showStorageSetupModal();
    return null;
  }

  const { data: { publicUrl } } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return publicUrl;
}

function showStorageSetupModal() {
  const sql = `-- Виконайте в Supabase → SQL Editor і перезавантажте сторінку:

-- 1. Публічний бакет для зображень
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('store-images', 'store-images', true, 10485760)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Увімкнути RLS для storage.objects (якщо ще не)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Policies (спочатку видаляємо якщо є, потім створюємо)
DROP POLICY IF EXISTS "store_img_insert" ON storage.objects;
CREATE POLICY "store_img_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'store-images');

DROP POLICY IF EXISTS "store_img_select" ON storage.objects;
CREATE POLICY "store_img_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'store-images');

DROP POLICY IF EXISTS "store_img_update" ON storage.objects;
CREATE POLICY "store_img_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'store-images')
  WITH CHECK (bucket_id = 'store-images');

DROP POLICY IF EXISTS "store_img_delete" ON storage.objects;
CREATE POLICY "store_img_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'store-images');`;

  let modal = document.getElementById('storage-setup-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'storage-setup-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="modal" style="max-width:580px">
      <div class="modal-hdr" style="padding:18px 20px;border-bottom:1px solid var(--gl2);display:flex;align-items:center;justify-content:space-between">
        <h3 style="font-size:16px;font-weight:800;margin:0">🗄️ Налаштування Supabase Storage</h3>
        <button class="btn-icon" onclick="document.getElementById('storage-setup-modal').classList.remove('open')">✕</button>
      </div>
      <div style="padding:20px">
        <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:13px;line-height:1.5">
          ⚠️ Бакет <b>store-images</b> не знайдено або доступ заборонений.<br>
          Виконайте SQL нижче у
          <a href="https://supabase.com/dashboard" target="_blank" style="color:var(--g);font-weight:700">Supabase → SQL Editor</a>,
          після чого перезавантажте сторінку.
        </div>
        <textarea id="storage-sql-area" readonly style="width:100%;height:220px;font-family:monospace;font-size:11px;border:1px solid var(--gl2);border-radius:8px;padding:10px;resize:none;background:#f8f9fa;color:#1a1d1f">${sql}</textarea>
        <div style="display:flex;gap:10px;margin-top:12px">
          <button class="btn btn-primary" onclick="copyStorageSql()" style="flex:1">📋 Копіювати SQL</button>
          <button class="btn" onclick="document.getElementById('storage-setup-modal').classList.remove('open')" style="flex:1">Закрити</button>
        </div>
      </div>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
  }
  modal.classList.add('open');
}

window.copyStorageSql = function () {
  const el = document.getElementById('storage-sql-area');
  if (el) {
    navigator.clipboard?.writeText(el.value).catch(() => {
      el.select();
      document.execCommand('copy');
    });
    toast('📋 SQL скопійовано!', 'success');
  }
};

// ─── SETUP SQL ────────────────────────────────────────────
function renderSetupCard(section) {
  const sql = `-- Run this in Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  image_url TEXT,
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  seo_title TEXT,
  seo_description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT,
  description TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  old_price NUMERIC,
  emoji TEXT DEFAULT '🌿',
  image_url TEXT,
  sku TEXT,
  in_stock BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  seo_title TEXT,
  seo_description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_categories (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  items JSONB,
  total NUMERIC,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: allow authenticated users full access
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_categories" ON categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_products" ON products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_pc" ON product_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_orders" ON orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_read_categories" ON categories FOR SELECT TO anon USING (is_active = true);
CREATE POLICY "anon_read_products" ON products FOR SELECT TO anon USING (is_active = true);
CREATE POLICY "anon_read_pc" ON product_categories FOR SELECT TO anon USING (true);

-- Storage bucket (run separately or create in Storage UI):
-- INSERT INTO storage.buckets (id, name, public) VALUES ('store-images', 'store-images', true);`;

  return `<div class="setup-card" style="margin:16px">
    <div style="font-size:36px;margin-bottom:10px">🛠️</div>
    <div style="font-size:14px;font-weight:700;margin-bottom:6px">Налаштуйте базу даних</div>
    <div style="font-size:13px;color:var(--gt);margin-bottom:14px">Виконайте цей SQL у <b>Supabase → SQL Editor</b>, після чого перезавантажте сторінку</div>
    <button class="btn btn-primary btn-sm" onclick="copySql()" style="margin-bottom:10px">📋 Копіювати SQL</button>
    <textarea class="setup-sql" id="setup-sql-area" readonly rows="8">${sql}</textarea>
  </div>`;
}

window.copySql = function () {
  const el = document.getElementById('setup-sql-area');
  if (el) { navigator.clipboard?.writeText(el.value); toast('📋 SQL скопійовано!', 'success'); }
};

// ─── MODAL HELPERS ────────────────────────────────────────
function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
});

// ─── TOAST ────────────────────────────────────────────────
function toast(msg, type = 'default', duration = 3000) {
  const wrap = document.getElementById('toast-wrap');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ─── UTILS ────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' }) + ' ' +
    d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

function slugify(text) {
  return text.toLowerCase()
    .replace(/[їі]/g, 'i').replace(/[ёе]/g, 'e').replace(/а/g, 'a')
    .replace(/[бβ]/g, 'b').replace(/в/g, 'v').replace(/г/g, 'g').replace(/д/g, 'd')
    .replace(/ж/g, 'zh').replace(/з/g, 'z').replace(/и/g, 'y').replace(/й/g, 'y')
    .replace(/к/g, 'k').replace(/л/g, 'l').replace(/м/g, 'm').replace(/н/g, 'n')
    .replace(/о/g, 'o').replace(/п/g, 'p').replace(/р/g, 'r').replace(/с/g, 's')
    .replace(/т/g, 't').replace(/у/g, 'u').replace(/ф/g, 'f').replace(/х/g, 'kh')
    .replace(/ц/g, 'ts').replace(/ч/g, 'ch').replace(/ш/g, 'sh').replace(/щ/g, 'shch')
    .replace(/ь/g, '').replace(/ю/g, 'yu').replace(/я/g, 'ya')
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    closeSidebar();
  }
});

// Key events on auth screen
document.getElementById('pw-inp')?.addEventListener('keydown', e => { if (e.key === 'Enter') window.signIn(); });

// ─── BANNERS ──────────────────────────────────────────────
let bannerFile = null;

async function loadBanners() {
  const grid = document.getElementById('banners-grid');
  const lbl = document.getElementById('banner-count-lbl');
  if (grid) grid.innerHTML = '<div class="tbl-loading">Завантаження...</div>';
  const { data, error } = await sb.from('banners').select('*').order('created_at');
  if (error) { if (grid) grid.innerHTML = '<div class="tbl-empty">Помилка завантаження</div>'; return; }
  const banners = data || [];
  if (lbl) lbl.textContent = `${banners.length} банер${banners.length === 1 ? '' : 'ів'}`;
  if (!banners.length) {
    if (grid) grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🖼</div><div class="empty-state-title">Банерів поки немає</div><div class="empty-state-sub">Додайте перший банер для головного слайдера</div></div>';
    return;
  }
  if (grid) grid.innerHTML = banners.map(b => `
    <div class="banner-card">
      <img class="banner-card-img" src="${b.image_url}" alt="${b.title || ''}">
      <div class="banner-card-body">
        <span class="banner-card-title">${b.title || 'Банер ' + b.id.slice(0,8)}</span>
        <button class="banner-card-del" onclick="deleteBanner('${b.id}')" title="Видалити">
          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
    </div>
  `).join('');
};

window.openBannerModal = function () {
  bannerFile = null;
  const prev = document.getElementById('ban-img-preview-img');
  const ph = document.getElementById('ban-img-placeholder');
  const inp = document.getElementById('ban-img-file');
  const title = document.getElementById('ban-title');
  if (prev) { prev.src = ''; prev.style.display = 'none'; }
  if (ph) ph.style.display = 'flex';
  if (inp) inp.value = '';
  if (title) title.value = '';
  document.getElementById('banner-modal').classList.add('open');
};

window.closeBannerModal = function () {
  document.getElementById('banner-modal').classList.remove('open');
};

window.onBanImgFile = function (input) {
  const file = input.files[0];
  if (!file) return;
  bannerFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    const prev = document.getElementById('ban-img-preview-img');
    const ph = document.getElementById('ban-img-placeholder');
    if (prev) { prev.src = e.target.result; prev.style.display = 'block'; }
    if (ph) ph.style.display = 'none';
  };
  reader.readAsDataURL(file);
};

window.saveBanner = async function () {
  if (!bannerFile) { toast('Оберіть фото банера', 'error'); return; }
  const btn = document.getElementById('ban-save-btn');
  btn.disabled = true; btn.textContent = 'Завантаження...';
  try {
    const ext = bannerFile.name.split('.').pop() || 'jpg';
    const filename = `banners/banner_${Date.now()}.${ext}`;
    const { error: upErr } = await sb.storage.from(STORAGE_BUCKET).upload(filename, bannerFile, { upsert: true, contentType: bannerFile.type });
    if (upErr) throw upErr;
    const { data: urlData } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(filename);
    const imageUrl = urlData.publicUrl;
    const title = document.getElementById('ban-title').value.trim();
    const { error: insErr } = await sb.from('banners').insert({ image_url: imageUrl, title, is_active: true, sort_order: 0 });
    if (insErr) throw insErr;
    closeBannerModal();
    toast('Банер додано!', 'success');
    loadBanners();
  } catch (e) {
    toast('Помилка: ' + (e.message || e), 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Зберегти';
  }
};

window.deleteBanner = async function (id) {
  if (!confirm('Видалити банер?')) return;
  const { error } = await sb.from('banners').delete().eq('id', id);
  if (error) { toast('Помилка видалення', 'error'); return; }
  toast('Банер видалено', 'success');
  loadBanners();
};
document.getElementById('email-inp')?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('pw-inp')?.focus(); });
