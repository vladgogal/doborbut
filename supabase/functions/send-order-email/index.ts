// Supabase Edge Function — send order emails via Resend
// Secrets required (set via Supabase Dashboard → Project Settings → Edge Functions → Secrets):
//   RESEND_API_KEY  — from resend.com
//   FROM_EMAIL      — e.g. "Добробут <orders@yourdomain.com>" (needs verified domain in Resend)
//                     For testing use "Добробут <onboarding@resend.dev>" — sends only to your Resend account email
//   SHOP_EMAIL      — email where the shop owner gets order notifications

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_KEY  = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL  = Deno.env.get("FROM_EMAIL")     ?? "Добробут <onboarding@resend.dev>";
const SHOP_EMAIL  = Deno.env.get("SHOP_EMAIL")     ?? "burialoleg61@gmail.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return new Response("Method not allowed", { status: 405 });

  if (!RESEND_KEY) {
    console.error("RESEND_API_KEY secret not set");
    return new Response(JSON.stringify({ error: "email not configured" }), { status: 500, headers: CORS });
  }

  let order: any;
  try { order = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: CORS });
  }

  const deliveryMap: Record<string, string> = {
    nova: "Nova Poshta",
    ukr: "Укрпошта",
    courier: "Кур'єр",
  };
  const deliveryLabel = deliveryMap[order.delivery_method] ?? order.delivery_method ?? "—";
  const payLabel = order.payment_method === "cod" ? "Накладений платіж (готівка)" : "Оплата карткою";
  const orderNum  = order.order_number ? `#${order.order_number}` : `#${Date.now()}`;
  const grandTotal = (Number(order.total) + Number(order.delivery_cost)).toFixed(0);

  const itemsRows = (order.items ?? []).map((i: any) =>
    `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0">${i.e ?? ""} ${i.nm ?? ""}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:center">${i.qty} шт</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:right;white-space:nowrap">${(i.p * i.qty)} грн</td>
    </tr>`
  ).join("");

  function buildHtml(forBuyer: boolean): string {
    const greeting = forBuyer
      ? `<p style="font-size:16px">Дякуємо за замовлення, <strong>${order.contact_name ?? ""}</strong>!</p>
         <p style="color:#555">Ми зв'яжемося з вами найближчим часом для підтвердження.</p>`
      : `<p style="font-size:16px">Отримано нове замовлення <strong>${orderNum}</strong></p>`;

    return `<!DOCTYPE html>
<html lang="uk">
<head><meta charset="utf-8"><title>Замовлення ${orderNum}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#222">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">

      <!-- header -->
      <tr><td style="background:#2a7a4f;padding:24px 32px">
        <h1 style="margin:0;color:#fff;font-size:24px;letter-spacing:-0.5px">🌿 Добробут</h1>
        <p style="margin:6px 0 0;color:#a8dfc0;font-size:13px">Замовлення ${orderNum}</p>
      </td></tr>

      <!-- greeting -->
      <tr><td style="padding:24px 32px 8px">${greeting}</td></tr>

      <!-- items table -->
      <tr><td style="padding:0 32px 16px">
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0f0f0;border-radius:8px;overflow:hidden">
          <thead>
            <tr style="background:#f8f8f8">
              <th style="padding:8px;text-align:left;font-size:12px;color:#888;font-weight:600">ТОВАР</th>
              <th style="padding:8px;text-align:center;font-size:12px;color:#888;font-weight:600">К-СТЬ</th>
              <th style="padding:8px;text-align:right;font-size:12px;color:#888;font-weight:600">СУМА</th>
            </tr>
          </thead>
          <tbody>${itemsRows}</tbody>
        </table>
      </td></tr>

      <!-- totals -->
      <tr><td style="padding:0 32px 16px">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:4px 0;color:#555;font-size:14px">Товари</td>
            <td style="padding:4px 0;text-align:right;font-size:14px">${order.total} грн</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#555;font-size:14px">Доставка (${deliveryLabel})</td>
            <td style="padding:4px 0;text-align:right;font-size:14px">${Number(order.delivery_cost) === 0 ? "Безкоштовно" : order.delivery_cost + " грн"}</td>
          </tr>
          <tr>
            <td style="padding:10px 0 4px;font-size:16px;font-weight:700;border-top:2px solid #f0f0f0">Разом</td>
            <td style="padding:10px 0 4px;text-align:right;font-size:18px;font-weight:800;color:#2a7a4f;border-top:2px solid #f0f0f0">${grandTotal} грн</td>
          </tr>
        </table>
      </td></tr>

      <!-- delivery & contact -->
      <tr><td style="padding:0 32px 24px">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8faf9;border-radius:8px;padding:16px">
          <tr><td style="padding:4px 0">
            <span style="color:#888;font-size:12px;font-weight:600">ДОСТАВКА</span><br>
            <span style="font-size:14px">${deliveryLabel} — ${order.city ?? ""}${order.delivery_address ? ", " + order.delivery_address : ""}</span>
          </td></tr>
          <tr><td style="padding:8px 0 4px">
            <span style="color:#888;font-size:12px;font-weight:600">ОПЛАТА</span><br>
            <span style="font-size:14px">${payLabel}</span>
          </td></tr>
          <tr><td style="padding:8px 0 4px">
            <span style="color:#888;font-size:12px;font-weight:600">ОДЕРЖУВАЧ</span><br>
            <span style="font-size:14px">${order.contact_name ?? "—"} · ${order.contact_phone ?? "—"}${order.contact_email ? " · " + order.contact_email : ""}</span>
          </td></tr>
        </table>
      </td></tr>

      <!-- footer -->
      <tr><td style="background:#f8f8f8;padding:16px 32px;text-align:center;color:#aaa;font-size:12px">
        © ${new Date().getFullYear()} Добробут — товари для дому з любов'ю
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
  }

  async function sendEmail(to: string, subject: string, html: string) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_KEY}`,
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`Resend error [${res.status}]:`, err);
      return false;
    }
    return true;
  }

  // 1 — notify shop owner
  await sendEmail(SHOP_EMAIL, `🛍 Нове замовлення ${orderNum} — ${order.contact_name}`, buildHtml(false));

  // 2 — confirmation to buyer (only if they gave an email)
  if (order.contact_email) {
    await sendEmail(order.contact_email, `Ваше замовлення ${orderNum} прийнято — Добробут`, buildHtml(true));
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
