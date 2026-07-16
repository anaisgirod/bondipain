const { sendEmail, wrap, itemsTable, money } = require('./_email');

// Email de confirmation de commande (B2C) — appelé par le site après enregistrement de la commande.
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { to, orderRef, items, total, deliveryDate, payLabel, name, company, phone, addr, lang } = req.body || {};
  if (!to || !orderRef || !Array.isArray(items)) {
    res.status(400).json({ error: 'Champs requis manquants.' });
    return;
  }
  const en = lang === 'en';
  try {
    const inner = `
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">${en ? `Hi ${name || ''},<br>Thanks for your order! Here's your summary.` : `Bonjour ${name || ''},<br>Merci pour votre commande ! Voici votre récapitulatif.`}</p>
      <div style="background:#FDF1E5;border-radius:12px;padding:14px 16px;margin-bottom:18px;">
        <div style="font-size:13px;color:#837A70;">${en ? 'Order number' : 'N° de commande'}</div>
        <div style="font-family:Georgia,serif;font-weight:bold;font-size:20px;color:#C9711B;">${orderRef}</div>
      </div>
      ${itemsTable(items)}
      <table style="width:100%;border-collapse:collapse;font-size:16px;margin-top:12px;">
        <tr><td style="padding:10px 0;font-weight:bold;">${en ? 'Total' : 'Total'}</td>
        <td style="padding:10px 0;text-align:right;font-weight:bold;color:#C9711B;">${money(total)}</td></tr>
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
    const subject = en ? `Your Bondipain order ${orderRef}` : `Votre commande Bondipain ${orderRef}`;
    await sendEmail({ to, subject, html: wrap(en ? 'Order confirmed 🎉' : 'Commande confirmée 🎉', inner) });

    // Notification à Bondipain (livreur) — tous les détails, best-effort (n'affecte pas la réponse au client)
    const notify = process.env.ORDERS_NOTIFY_EMAIL || 'hello@bondipain.com';
    try {
      const adminInner = `
        <div style="background:#FDF1E5;border-radius:12px;padding:14px 16px;margin-bottom:18px;">
          <div style="font-size:13px;color:#837A70;">N° de commande</div>
          <div style="font-family:Georgia,serif;font-weight:bold;font-size:20px;color:#C9711B;">${orderRef}</div>
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
          <td style="padding:10px 0;text-align:right;font-weight:bold;color:#C9711B;">${money(total)}</td></tr>
        </table>
        <p style="font-size:14px;color:#837A70;margin-top:14px;line-height:1.6;">
          ${deliveryDate ? `Livraison : <b>${deliveryDate}</b><br>` : ''}
          ${payLabel ? `Paiement : ${payLabel}` : ''}
        </p>`;
      await sendEmail({
        to: notify,
        subject: `🛵 Nouvelle commande ${orderRef}${name ? ' — ' + name : ''}`,
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
