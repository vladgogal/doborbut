// ⚠️ DEMO: замени ключи на свои из liqpay.ua (кабінет → Бізнес → API)
// В продакшені signature повинна генеруватись на бекенді — не тут.
export const LIQPAY_PUBLIC_KEY  = 'sandbox_i90895435862';
export const LIQPAY_PRIVATE_KEY = 'sandbox_xXV8nvgR7NmGCQlknZSa1mBiNgKoZKHLpjPhXCb5';

async function sha1base64(str) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(str));
  return btoa(Array.from(new Uint8Array(buf)).map(b => String.fromCharCode(b)).join(''));
}

function b64unicode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

export async function liqpayCheckout({ amount, orderId, description }) {
  try {
    const dataObj = {
      public_key:  LIQPAY_PUBLIC_KEY,
      version:     3,
      action:      'pay',
      amount:      amount,
      currency:    'UAH',
      description: description,
      order_id:    orderId,
      language:    'uk',
      result_url:  window.location.origin + '/?payment=success',
      sandbox:     1,
    };

    const data      = b64unicode(JSON.stringify(dataObj));
    const signature = await sha1base64(LIQPAY_PRIVATE_KEY + data + LIQPAY_PRIVATE_KEY);

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = 'https://www.liqpay.ua/api/3/checkout';
    form.style.display = 'none';

    [['data', data], ['signature', signature]].forEach(([n, v]) => {
      const inp = document.createElement('input');
      inp.type = 'hidden'; inp.name = n; inp.value = v;
      form.appendChild(inp);
    });

    document.body.appendChild(form);
    form.submit();
  } catch (err) {
    console.error('[liqpay]', err);
    if (typeof window.showToast === 'function') {
      window.showToast('❌ Помилка платіжної системи: ' + err.message);
    }
  }
}
