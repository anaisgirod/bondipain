const { sendEmail, wrap, button, itemsTable, money } = require('./_email');
const { getSupabaseAdmin } = require('./_supabaseAdmin');

// Numéro marchand Juice by MCB (surchargarble via variable d'environnement)
const JUICE_NUMBER = process.env.JUICE_MERCHANT_NUMBER || '+230 5492 2393';

// Email(s) de commande (B2C) — appelé par le site après enregistrement de la commande.
// - Cash / carte : « Commande confirmée »
// - Juice by MCB : « Commande reçue » (en attente de paiement) + un email séparé d'instructions de paiement
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { to, orderRef, items, total, deliveryDate, payLabel, payMethod, name, company, phone, addr, lang, days, customerId, promoCode, promoAmount } = req.body || {};
  if (!to || !orderRef || !Array.isArray(items)) {
    res.status(400).json({ error: 'Champs requis manquants.' });
    return;
  }
  const en = lang === 'en';
  const isJuice = payMethod === 'juice' || /juice/i.test(payLabel || '');

  // ── Enregistrement de la commande (TOUTES les commandes Particulier, invités compris) ──
  // Une ligne par jour de livraison dans la table 'orders' → alimente le Reporting.
  if (Array.isArray(days) && days.length) {
    try {
      const sb = getSupabaseAdmin();
      const rows = days.map(d => ({
        customer_id: customerId || null,
        order_ref: orderRef,
        order_items: d.items || [],
        order_total: Math.round(Number(d.total) || 0),
        payment_method: payMethod || null,
        delivery_date: d.date || null,
        customer_name: name || null,
        customer_phone: phone || null,
        delivery_address: addr || null,
        status: 'confirmed',
      }));
      const { error } = await sb.from('orders').insert(rows);
      if (error) console.warn('order persist error:', error.message);
    } catch (e) { console.warn('order persist exception:', e && e.message); }
  }

  try {
    // ── 1) Email client : confirmation (cash/carte) ou « commande reçue » (Juice) ──
    const statusBanner = isJuice ? `
      <div style="background:#FFF4E0;border:1px solid #FEC12C;border-radius:12px;padding:14px 16px;margin-bottom:18px;font-size:14px;color:#8A5A00;line-height:1.6;">
        ${en
          ? `⏳ <b>Awaiting payment.</b> Your order will be confirmed once we receive your Juice payment. See the payment instructions in our next email.`
          : `⏳ <b>En attente de paiement.</b> Votre commande sera confirmée dès réception de votre paiement Juice. Les instructions de paiement vous arrivent dans un email séparé.`}
      </div>` : '';
    const inner = `
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">${en ? `Hi ${name || ''},<br>Thanks for your order! Here's your summary.` : `Bonjour ${name || ''},<br>Merci pour votre commande ! Voici votre récapitulatif.`}</p>
      ${statusBanner}
      <div style="background:#FDF1E5;border-radius:12px;padding:14px 16px;margin-bottom:18px;">
        <div style="font-size:13px;color:#837A70;">${en ? 'Order number' : 'N° de commande'}</div>
        <div style="font-family:Georgia,serif;font-weight:bold;font-size:20px;color:#DA4928;">${orderRef}</div>
      </div>
      ${itemsTable(items)}
      <table style="width:100%;border-collapse:collapse;font-size:16px;margin-top:12px;">
        ${promoCode && Number(promoAmount) > 0 ? `<tr><td style="padding:4px 0;color:#2E7D52;font-size:14px;">${en ? 'Promo code' : 'Code promo'} (${promoCode})</td><td style="padding:4px 0;text-align:right;color:#2E7D52;font-size:14px;">−${money(Number(promoAmount))}</td></tr>` : ''}
        <tr><td style="padding:10px 0;font-weight:bold;">${en ? 'Total' : 'Total'}</td>
        <td style="padding:10px 0;text-align:right;font-weight:bold;color:#DA4928;">${money(total)}</td></tr>
      </table>
      <p style="font-size:14px;color:#837A70;margin-top:16px;line-height:1.6;">
        ${deliveryDate ? `${en ? 'Delivery' : 'Livraison'} : <b>${deliveryDate}</b><br>` : ''}
        ${payLabel ? `${en ? 'Payment' : 'Paiement'} : ${payLabel}<br>` : ''}
        ${en ? 'Delivery between 11am and 2pm · Moka area.' : 'Livraison entre 11h et 14h · Zone de Moka.'}
      </p>
      ${(addr || phone || company) ? `
      <div style="background:#F7F3EC;border-radius:12px;padding:14px 16px;margin-top:8px;font-size:14px;color:#33302C;line-height:1.6;">
        <div style="font-weight:bold;margin-bottom:6px;">${en ? 'Delivery details' : 'Détails de livraison'}</div>
        ${name ? `${en ? 'Name' : 'Nom'} : ${name}<br>` : ''}
        ${company ? `${en ? 'Company' : 'Entreprise'} : ${company}<br>` : ''}
        ${phone ? `${en ? 'Phone' : 'Téléphone'} : ${phone}<br>` : ''}
        ${addr ? `${en ? 'Address' : 'Adresse'} : ${addr}` : ''}
      </div>` : ''}`;
    const title = isJuice
      ? (en ? 'Order received' : 'Commande reçue')
      : (en ? 'Order confirmed 🎉' : 'Commande confirmée 🎉');
    const subject = isJuice
      ? (en ? `Bondipain order received ${orderRef}` : `Commande Bondipain reçue ${orderRef}`)
      : (en ? `Your Bondipain order ${orderRef}` : `Votre commande Bondipain ${orderRef}`);
    await sendEmail({ to, subject, html: wrap(title, inner) });

    // ── 2) Email client séparé : instructions de paiement Juice ──
    if (isJuice) {
      const payInner = `
        <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">${en
          ? `Hi ${name || ''},<br>To confirm your order, please pay via <b>Juice by MCB</b> following the steps below.`
          : `Bonjour ${name || ''},<br>Pour confirmer votre commande, réglez via <b>Juice by MCB</b> en suivant les étapes ci-dessous.`}</p>
        <div style="background:#FDF1E5;border-radius:12px;padding:18px 16px;margin-bottom:18px;text-align:center;">
          <div style="font-size:13px;color:#837A70;">${en ? 'Amount to send' : 'Montant à envoyer'}</div>
          <div style="font-family:Georgia,serif;font-weight:bold;font-size:30px;color:#DA4928;margin:2px 0 12px;">${money(total)}</div>
          <div style="font-size:13px;color:#837A70;">${en ? 'Merchant number' : 'Numéro marchand'}</div>
          <div style="font-family:Georgia,serif;font-weight:bold;font-size:22px;color:#2A2622;">${JUICE_NUMBER}</div>
          <div style="font-size:13px;color:#837A70;margin-top:12px;">${en ? 'Reference to include' : 'Référence à indiquer'}</div>
          <div style="font-family:Georgia,serif;font-weight:bold;font-size:20px;color:#2A2622;">${orderRef}</div>
        </div>
        <ol style="font-size:14.5px;line-height:1.7;color:#33302C;padding-left:20px;margin:0 0 16px;">
          <li>${en ? 'Open the <b>Juice by MCB</b> app.' : 'Ouvrez l\'application <b>Juice by MCB</b>.'}</li>
          <li>${en ? `Send <b>${money(total)}</b> to <b>${JUICE_NUMBER}</b>.` : `Envoyez <b>${money(total)}</b> au <b>${JUICE_NUMBER}</b>.`}</li>
          <li>${en ? `Add your order number <b>${orderRef}</b> as the reference.` : `Indiquez votre n° de commande <b>${orderRef}</b> en référence.`}</li>
        </ol>
        <p style="font-size:14px;color:#837A70;line-height:1.6;margin:0;">${en
          ? 'Once we receive your payment, you\'ll get a final confirmation email. Delivery between 11am and 2pm · Moka area.'
          : 'Dès réception de votre paiement, vous recevrez un email de confirmation. Livraison entre 11h et 14h · Zone de Moka.'}</p>`;
      const paySubject = en ? `Payment for your order ${orderRef} — Juice by MCB` : `Paiement de votre commande ${orderRef} — Juice by MCB`;
      try {
        await sendEmail({ to, subject: paySubject, html: wrap(en ? 'How to pay via Juice' : 'Comment payer via Juice', payInner, { preheader: en ? `Send ${money(total)} via Juice to confirm` : `Envoyez ${money(total)} via Juice pour confirmer` }) });
      } catch (payErr) {
        console.warn('juice payment email error', payErr && payErr.message);
      }
    }

    // ── 3) Notification à Bondipain (livreur) — best-effort ──
    const notify = process.env.ORDERS_NOTIFY_EMAIL || 'info@bondipain.com';
    try {
      const payFlag = isJuice
        ? `<div style="background:#FFF4E0;border:1px solid #FEC12C;border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:14px;color:#8A5A00;">💳 Paiement <b>Juice</b> — à encaisser (réf. ${orderRef}). Confirmez le paiement dans l'admin une fois reçu.</div>`
        : '';
      const adminInner = `
        ${payFlag}
        <div style="background:#FDF1E5;border-radius:12px;padding:14px 16px;margin-bottom:18px;">
          <div style="font-size:13px;color:#837A70;">N° de commande</div>
          <div style="font-family:Georgia,serif;font-weight:bold;font-size:20px;color:#DA4928;">${orderRef}</div>
        </div>
        <div style="background:#F7F3EC;border-radius:12px;padding:14px 16px;margin-bottom:16px;font-size:15px;color:#33302C;line-height:1.7;">
          <div style="font-weight:bold;margin-bottom:6px;">📍 Livraison</div>
          ${name ? `Nom : <b>${name}</b><br>` : ''}
          ${company ? `Entreprise : <b>${company}</b><br>` : ''}
          ${phone ? `Téléphone : <b>${phone}</b><br>` : ''}
          ${addr ? `Adresse : <b>${addr}</b><br>` : ''}
          ${to ? `Email : ${to}` : ''}
        </div>
        ${itemsTable(items)}
        <table style="width:100%;border-collapse:collapse;font-size:16px;margin-top:12px;">
          <tr><td style="padding:10px 0;font-weight:bold;">Total</td>
          <td style="padding:10px 0;text-align:right;font-weight:bold;color:#DA4928;">${money(total)}</td></tr>
        </table>
        <p style="font-size:14px;color:#837A70;margin-top:14px;line-height:1.6;">
          ${deliveryDate ? `Livraison : <b>${deliveryDate}</b><br>` : ''}
          ${payLabel ? `Paiement : ${payLabel}` : ''}
        </p>`;
      await sendEmail({
        to: notify,
        subject: `🛵 Nouvelle commande ${orderRef}${name ? ' — ' + name : ''}${isJuice ? ' (Juice à encaisser)' : ''}`,
        html: wrap('Nouvelle commande', adminInner),
      });
    } catch (notifyErr) {
      console.warn('order-email notify error', notifyErr && notifyErr.message);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('order-email error', err);
    res.status(500).json({ error: "Erreur lors de l'envoi de l'email." });
  }
};
