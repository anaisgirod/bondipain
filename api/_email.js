const { Resend } = require('resend');

const FROM = 'Bondipain <commandes@bondipain.com>';
// Palette officielle Bondipain (charte graphique)
const BRAND = '#FF8C00';       // orange vif (logo)
const BRAND_DEEP = '#DA4928';  // brique
const GOLD = '#FEC12C';        // jaune doré
const INK = '#2A2622';
const CREAM = '#F7F5F0';

function money(n) { return 'Rs ' + Math.round(Number(n || 0)); }

// Gabarit HTML de base, aux couleurs Bondipain
function wrap(title, innerHtml, opts = {}) {
  const footer = opts.footer || 'Bondipain · Pain garni fait maison · Livraison à Moka';
  const preheader = opts.preheader || '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;background:${CREAM};font-family:Arial,Helvetica,sans-serif;color:${INK};">
    ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>` : ''}
    <div style="max-width:560px;margin:0 auto;padding:24px 18px;">
      <!-- En-tête : bandeau orange arrondi -->
      <div style="background:${BRAND};border-radius:16px 16px 0 0;padding:22px 26px;text-align:center;">
        <span style="font-family:Georgia,serif;font-weight:bold;font-size:28px;color:#fff;letter-spacing:.5px;">Bondipain</span>
        <div style="height:4px;width:52px;background:${GOLD};border-radius:999px;margin:10px auto 0;"></div>
      </div>
      <!-- Corps -->
      <div style="background:#fff;border-radius:0 0 16px 16px;padding:30px 28px;box-shadow:0 4px 18px rgba(60,40,15,.08);">
        <h1 style="font-size:22px;margin:0 0 16px;color:${BRAND_DEEP};">${title}</h1>
        ${innerHtml}
      </div>
      <p style="text-align:center;color:#837A70;font-size:12px;margin:22px 0 0;line-height:1.6;">${footer}<br>
        <a href="https://www.bondipain.com" style="color:${BRAND_DEEP};text-decoration:none;font-weight:bold;">www.bondipain.com</a>
      </p>
    </div>
  </body></html>`;
}

// Bouton d'action (CTA) réutilisable — à insérer dans innerHtml
function button(label, url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr><td style="border-radius:999px;background:${BRAND};">
    <a href="${url}" style="display:inline-block;padding:13px 30px;font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:15px;color:#fff;text-decoration:none;border-radius:999px;">${label}</a>
  </td></tr></table>`;
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

module.exports = { sendEmail, wrap, button, itemsTable, money, FROM };
