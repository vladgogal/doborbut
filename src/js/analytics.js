// Analytics & tracking module — GA4 + Meta Pixel + GTM + Clarity
// All IDs come from Vite env vars; missing IDs are skipped silently.

const GA4_ID     = import.meta.env.VITE_GA4_MEASUREMENT_ID || '';
const GTM_ID     = import.meta.env.VITE_GTM_ID             || '';
const PIXEL_ID   = import.meta.env.VITE_META_PIXEL_ID      || '';
const CLARITY_ID = import.meta.env.VITE_CLARITY_PROJECT_ID || '';

function gtag(...args) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(args);
}

export function initAnalytics() {
  // ── Google Tag Manager ──────────────────────────────────────────
  if (GTM_ID) {
    window.dataLayer = window.dataLayer || [];
    (function(w, d, s, l, i) {
      w[l] = w[l] || [];
      w[l].push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
      const f = d.getElementsByTagName(s)[0];
      const j = d.createElement(s);
      const dl = l !== 'dataLayer' ? '&l=' + l : '';
      j.async = true;
      j.src = 'https://www.googletagmanager.com/gtm.js?id=' + i + dl;
      f.parentNode.insertBefore(j, f);
    })(window, document, 'script', 'dataLayer', GTM_ID);
  }

  // ── GA4 (direct, without GTM) ───────────────────────────────────
  if (GA4_ID && !GTM_ID) {
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_ID;
    document.head.appendChild(s);
    gtag('js', new Date());
    gtag('config', GA4_ID, { send_page_view: true });
  }

  // ── Meta Pixel ──────────────────────────────────────────────────
  if (PIXEL_ID) {
    !function(f,b,e,v,n,t,s){
      if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)
    }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', PIXEL_ID);
    window.fbq('track', 'PageView');
  }

  // ── Microsoft Clarity ───────────────────────────────────────────
  if (CLARITY_ID) {
    (function(c,l,a,r,i,t,y){
      c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
      t=l.createElement(r);t.async=1;t.src='https://www.clarity.ms/tag/'+i;
      y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window,document,'clarity','script',CLARITY_ID);
  }
}

// ── Helper: format GA4 items array ─────────────────────────────────
function toGA4Item(item, index) {
  return {
    item_id:    String(item.id),
    item_name:  item.nm,
    price:      item.p,
    quantity:   item.qty || 1,
    index:      index || 0,
  };
}

// ── Helper: format Meta Pixel content ──────────────────────────────
function toPixelContent(item) {
  return { id: String(item.id), quantity: item.qty || 1 };
}

// ── view_item (product page open) ──────────────────────────────────
export function trackViewItem(product) {
  if (GA4_ID) {
    gtag('event', 'view_item', {
      currency: 'UAH',
      value:    product.p,
      items:    [toGA4Item(product)],
    });
  }
  if (PIXEL_ID && window.fbq) {
    window.fbq('track', 'ViewContent', {
      content_type:    'product',
      content_ids:     [String(product.id)],
      content_name:    product.nm,
      value:           product.p,
      currency:        'UAH',
    });
  }
}

// ── add_to_cart ─────────────────────────────────────────────────────
export function trackAddToCart(product, qty) {
  const q = qty || 1;
  if (GA4_ID) {
    gtag('event', 'add_to_cart', {
      currency: 'UAH',
      value:    product.p * q,
      items:    [{ ...toGA4Item(product), quantity: q }],
    });
  }
  if (PIXEL_ID && window.fbq) {
    window.fbq('track', 'AddToCart', {
      content_type: 'product',
      content_ids:  [String(product.id)],
      content_name: product.nm,
      value:        product.p * q,
      currency:     'UAH',
    });
  }
}

// ── remove_from_cart ────────────────────────────────────────────────
export function trackRemoveFromCart(product) {
  if (GA4_ID) {
    gtag('event', 'remove_from_cart', {
      currency: 'UAH',
      value:    product.p * (product.qty || 1),
      items:    [toGA4Item(product)],
    });
  }
}

// ── begin_checkout (step 1 completed) ──────────────────────────────
export function trackBeginCheckout(cartItems, total) {
  if (GA4_ID) {
    gtag('event', 'begin_checkout', {
      currency: 'UAH',
      value:    total,
      items:    cartItems.map(toGA4Item),
    });
  }
  if (PIXEL_ID && window.fbq) {
    window.fbq('track', 'InitiateCheckout', {
      content_type: 'product',
      content_ids:  cartItems.map(function(x) { return String(x.id); }),
      num_items:    cartItems.reduce(function(s, x) { return s + (x.qty || 1); }, 0),
      value:        total,
      currency:     'UAH',
    });
  }
}

// ── add_payment_info (step 3 — payment chosen) ─────────────────────
export function trackAddPaymentInfo(cartItems, total, paymentType) {
  if (GA4_ID) {
    gtag('event', 'add_payment_info', {
      currency:     'UAH',
      value:        total,
      payment_type: paymentType || 'unknown',
      items:        cartItems.map(toGA4Item),
    });
  }
  if (PIXEL_ID && window.fbq) {
    window.fbq('track', 'AddPaymentInfo', {
      value:    total,
      currency: 'UAH',
    });
  }
}

// ── purchase ────────────────────────────────────────────────────────
export function trackPurchase(orderData) {
  const items  = (orderData.items || []);
  const total  = orderData.total  || 0;
  const orderId = orderData.order_number || orderData.orderId || ('ord_' + Date.now());

  if (GA4_ID) {
    gtag('event', 'purchase', {
      transaction_id: String(orderId),
      currency:       'UAH',
      value:          total,
      shipping:       orderData.delivery_cost || 0,
      items:          items.map(toGA4Item),
    });
  }
  if (PIXEL_ID && window.fbq) {
    window.fbq('track', 'Purchase', {
      content_type: 'product',
      content_ids:  items.map(function(x) { return String(x.id); }),
      value:        total,
      currency:     'UAH',
    });
  }
}

// ── updateMeta (dynamic page meta tags) ────────────────────────────
export function updateMeta(opts) {
  // opts: { title, description, image, url }
  if (opts.title) {
    document.title = opts.title + ' — Добробут';
    _setMeta('og:title', opts.title + ' — Добробут');
    _setMeta('twitter:title', opts.title + ' — Добробут');
  }
  if (opts.description) {
    _setMeta('description', opts.description);
    _setMeta('og:description', opts.description);
    _setMeta('twitter:description', opts.description);
  }
  if (opts.image) {
    _setMeta('og:image', opts.image);
    _setMeta('twitter:image', opts.image);
  }
  if (opts.url) {
    _setMeta('og:url', opts.url);
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.href = opts.url;
  }
}

function _setMeta(nameOrProp, content) {
  let el = document.querySelector('meta[name="' + nameOrProp + '"]')
        || document.querySelector('meta[property="' + nameOrProp + '"]');
  if (!el) {
    el = document.createElement('meta');
    const attr = nameOrProp.startsWith('og:') || nameOrProp.startsWith('twitter:')
      ? 'property' : 'name';
    el.setAttribute(attr, nameOrProp);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}
