const { Resend } = require('resend');

const FROM = 'Bondipain <commandes@bondipain.com>';
const BRAND = '#C9711B';
const INK = '#2A2622';

function money(n) { return 'Rs ' + Math.round(Number(n || 0)); }

// Gabarit HTML de base, aux couleurs Bondipain
function wrap(title, innerHtml, opts = {}) {
  const footer = opts.footer || 'Bondipain · Pain garni fait maison · Livraison à Moka';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;background:#F5F0EB;font-family:Arial,Helvetica,sans-serif;color:${INK};">
    <div style="max-width:560px;margin:0 auto;padding:24px;">
      <div style="text-align:center;padding:18px 0;">
        <span style="font-family:Georgia,serif;font-weight:bold;font-size:26px;color:${BRAND};">Bondipain</span>
      </div>
      <div style="background:#fff;border-radius:16px;padding:28px 26px;box-shadow:0 4px 18px rgba(60,40,15,.08);">
        <h1 style="font-size:21px;margin:0 0 14px;color:${INK};">${title}</h1>
        ${innerHtml}
      </div>
      <p style="text-align:center;color:#837A70;font-size:12px;margin:20px 0 0;line-height:1.6;">${footer}</p>
    </div>
  </body></html>`;
}

function itemsTable(items) {
  const rows = (items || []).map((it) => {
    const name = (it.name && (it.name.fr || it.name.en)) || it.name || 'Repas';
    const qty = it.qty || 1;
    const line = it.lineTotal != null ? money(it.lineTotal) : (it.price != null ? money(it.price) : '');
    return `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #EFE3D5;">${qty}× ${name}</td>
      <td style="padding:8px 0;border-bottom:1px solid #EFE3D5;text-align:right;white-space:nowrap;">${line}</td>
    </tr>`;
  }).join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:15px;">${rows}</table>`;
}

async function sendEmail({ to, subject, html }) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  return resend.emails.send({ from: FROM, to, subject, html });
}

module.exports = { sendEmail, wrap, itemsTable, money, FROM };
