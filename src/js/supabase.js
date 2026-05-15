// Клієнт Supabase і API для кошика, обраного, відгуків.
// Якщо змінні оточення VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY не задані,
// клієнт = null і всі методи повертають локальні заглушки (працюємо через localStorage).
//
// КОЛИ ПІДКЛЮЧИШ Supabase:
//   1) Створи .env у корені проекту:
//        VITE_SUPABASE_URL=https://xxxxx.supabase.co
//        VITE_SUPABASE_ANON_KEY=eyJ... (publishable / anon — НЕ secret!)
//   2) У Supabase Studio створи таблиці (SQL у файлі supabase/schema.sql)
//   3) Перезапусти `npm run dev` — клієнт автоматично підключиться.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

if (!isSupabaseConfigured) {
  console.info(
    '[supabase] Не сконфігуровано. Використовується localStorage. ' +
    'Додай VITE_SUPABASE_URL та VITE_SUPABASE_ANON_KEY у .env, щоб увімкнути.'
  );
}

// ─────────────────────────────────────────────────────────────
// Універсальний помічник — fallback на localStorage
// ─────────────────────────────────────────────────────────────
function lsGet(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ─────────────────────────────────────────────────────────────
// КОШИК (cart_items: user_id, product_id, qty)
// ─────────────────────────────────────────────────────────────
export const cartAPI = {
  async list() {
    if (!supabase) return lsGet('cart', []);
    const { data, error } = await supabase.from('cart_items').select('*');
    if (error) { console.error(error); return lsGet('cart', []); }
    return data || [];
  },
  async add(productId, qty = 1) {
    if (!supabase) {
      const cart = lsGet('cart', []);
      const existing = cart.find(c => c.product_id === productId);
      if (existing) existing.qty += qty;
      else cart.push({ product_id: productId, qty });
      lsSet('cart', cart);
      return cart;
    }
    const { error } = await supabase
      .from('cart_items')
      .upsert({ product_id: productId, qty }, { onConflict: 'product_id' });
    if (error) console.error(error);
  },
  async remove(productId) {
    if (!supabase) {
      const cart = lsGet('cart', []).filter(c => c.product_id !== productId);
      lsSet('cart', cart);
      return cart;
    }
    const { error } = await supabase.from('cart_items').delete().eq('product_id', productId);
    if (error) console.error(error);
  },
  async clear() {
    if (!supabase) { lsSet('cart', []); return; }
    const { error } = await supabase.from('cart_items').delete().neq('product_id', 0);
    if (error) console.error(error);
  },
};

// ─────────────────────────────────────────────────────────────
// ОБРАНЕ (favorites: user_id, product_id)
// ─────────────────────────────────────────────────────────────
export const favsAPI = {
  async list() {
    if (!supabase) return lsGet('favs', []);
    const { data } = await supabase.from('favorites').select('product_id');
    return (data || []).map(r => r.product_id);
  },
  async toggle(productId) {
    if (!supabase) {
      const favs = lsGet('favs', []);
      const i = favs.indexOf(productId);
      if (i >= 0) favs.splice(i, 1); else favs.push(productId);
      lsSet('favs', favs);
      return favs.includes(productId);
    }
    const { data } = await supabase
      .from('favorites').select('id').eq('product_id', productId).maybeSingle();
    if (data) {
      await supabase.from('favorites').delete().eq('product_id', productId);
      return false;
    }
    await supabase.from('favorites').insert({ product_id: productId });
    return true;
  },
};

// ─────────────────────────────────────────────────────────────
// ВІДГУКИ (reviews: product_id, name, rating, text, created_at)
// ─────────────────────────────────────────────────────────────
export const reviewsAPI = {
  async list(productId) {
    if (!supabase) return lsGet(`reviews_${productId}`, []);
    const { data, error } = await supabase
      .from('reviews').select('*').eq('product_id', productId)
      .order('created_at', { ascending: false });
    if (error) { console.error(error); return []; }
    return data || [];
  },
  async add(productId, { name, rating, text }) {
    if (!supabase) {
      const list = lsGet(`reviews_${productId}`, []);
      list.unshift({ name, rating, text, created_at: new Date().toISOString() });
      lsSet(`reviews_${productId}`, list);
      return;
    }
    const { error } = await supabase
      .from('reviews').insert({ product_id: productId, name, rating, text });
    if (error) console.error(error);
  },
};
