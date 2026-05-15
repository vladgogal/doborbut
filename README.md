# Добробут — магазин товарів для дому

Веб-магазин на Vite + Supabase. Готовий до деплою на Vercel чи Netlify.

## Структура

```
dobrobut-store/
├─ index.html              ← розмітка сторінки
├─ package.json
├─ vite.config.js
├─ vercel.json             ← конфіг деплою Vercel
├─ netlify.toml            ← конфіг деплою Netlify
├─ .env.example            ← шаблон змінних оточення
├─ supabase/
│  └─ schema.sql           ← SQL для створення таблиць + RLS
├─ public/                 ← статичні файли (favicon тощо)
└─ src/
   ├─ main.js              ← точка входу, вся логіка
   ├─ css/
   │  ├─ main.css          ← імпортує всі CSS-модулі
   │  ├─ base.css          ← базові стилі + компоненти
   │  ├─ stores.css        ← сторінка магазинів
   │  └─ product.css       ← сторінка товару + фільтри
   ├─ data/
   │  ├─ products.js       ← каталог товарів, категорії, відгуки
   │  ├─ i18n.js           ← переклади uk/en/ru
   │  └─ stores.js         ← список магазинів, кольори міток
   └─ js/
      └─ supabase.js       ← клієнт Supabase + API (cart/favs/reviews)
```

## Локальний запуск

```bash
npm install
cp .env.example .env       # відредагуй .env, якщо потрібен Supabase
npm run dev
```

Сайт відкриється на http://localhost:5173

## Збірка для продакшну

```bash
npm run build              # створить папку dist/
npm run preview            # локальний прев'ю продакшн-збірки
```

## Деплой

### Vercel
1. Залий проект на GitHub
2. На vercel.com → New Project → Import Git Repository
3. Vercel сам підхопить `vercel.json` і налаштує збірку
4. Додай змінні оточення в Project Settings → Environment Variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Натисни Deploy

### Netlify
1. Залий проект на GitHub
2. На netlify.com → Add new site → Import from Git
3. Налаштування підхопляться з `netlify.toml`
4. Site settings → Environment variables → додай ті ж дві змінні
5. Deploy

## Підключення Supabase

1. Створи проект на [supabase.com](https://supabase.com)
2. Project Settings → API → скопіюй:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon / publishable key** → `VITE_SUPABASE_ANON_KEY`

   > ⚠️ Бери саме **anon** (або новий формат `sb_publishable_...`).
   > **НЕ використовуй** `service_role` чи `sb_secret_...` у фронтенді —
   > вони обходять Row Level Security і дають повний доступ до бази.
3. У Supabase Studio → SQL Editor → встав вміст `supabase/schema.sql` → Run
4. Налаштуй auth (Authentication → Providers — увімкни Email або Google/Apple)
5. Перезапусти `npm run dev`

Без Supabase сайт працює: кошик, обране й відгуки автоматично зберігаються
в `localStorage` браузера. Як тільки додаси `.env` зі змінними — переключиться
на хмарне зберігання (потрібна автентифікація для RLS-політик).

## Що далі

- [ ] Авторизація через Supabase Auth (Email / Google / Apple)
- [ ] Сторінка замовлень у кабінеті
- [ ] Адмінка для додавання товарів
- [ ] Підключення оплати (Fondy / LiqPay / Stripe)
- [ ] Завантаження фото товарів у Supabase Storage замість emoji
