const { getSupabaseAdmin } = require('./_supabaseAdmin');
const { sendEmail, wrap, itemsTable, money } = require('./_email');

const ADMIN_EMAILS = ['info@bondipain.com', 'hello@bondipain.com', 'agirod@gramica.fr'];

async function getAdmin(req, supabaseAdmin) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  return ADMIN_EMAILS.includes((data.user.email || '').toLowerCase()) ? data.user : null;
}

// Confirmation « paiement reçu » — envoyé par l'admin une fois le paiement Juice encaissé.
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const admin = await getAdmin(req, supabaseAdmin);
    if (!admin) {
      res.status(403).json({ error: 'Accès réservé à Bondipain.' });
      return;
    }
    const { to, orderRef, total, name, items, deliveryDate, lang } = req.body || {};
    if (!to || !orderRef) {
      res.status(400).json({ error: 'Email et n° de commande requis.' });
      return;
    }
    const en = lang === 'en';
    const inner = `
      <div style="background:#E8F5E9;border:1px solid #2E7D52;border-radius:12px;padding:14px 16px;margin-bottom:18px;font-size:14.5px;color:#1E5C38;line-height:1.6;">
        ${en ? `✓ <b>Payment received.</b> Your order is now confirmed.` : `✓ <b>Paiement reçu.</b> Votre commande est confirmée.`}
      </div>
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">${en ? `Hi ${name || ''},<br>Thanks! We've received your payment.` : `Bonjour ${name || ''},<br>Merci ! Nous avons bien reçu votre paiement.`}</p>
      <div style="background:#FDF1E5;border-radius:12px;padding:14px 16px;margin-bottom:18px;">
        <div style="font-size:13px;color:#837A70;">${en ? 'Order number' : 'N° de commande'}</div>
        <div style="font-family:Georgia,serif;font-weight:bold;font-size:20px;color:#DA4928;">${orderRef}</div>
      </div>
      ${Array.isArray(items) && items.length ? itemsTable(items) : ''}
      ${total != null ? `<table style="width:100%;border-collapse:collapse;font-size:16px;margin-top:12px;">
        <tr><td style="padding:10px 0;font-weight:bold;">${en ? 'Paid' : 'Payé'}</td>
        <td style="padding:10px 0;text-align:right;font-weight:bold;color:#2E7D52;">${money(total)}</td></tr>
      </table>` : ''}
      <p style="font-size:14px;color:#837A70;margin-top:16px;line-height:1.6;">
        ${deliveryDate ? `${en ? 'Delivery' : 'Livraison'} : <b>${deliveryDate}</b><br>` : ''}
        ${en ? 'Delivery between 11am and 2pm · Moka area. See you soon!' : 'Livraison entre 11h et 14h · Zone de Moka. À très vite !'}
      </p>`;
    const subject = en ? `Payment received — order ${orderRef} confirmed` : `Paiement reçu — commande ${orderRef} confirmée`;
    await sendEmail({ to, subject, html: wrap(en ? 'Payment received ✓' : 'Paiement reçu ✓', inner) });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('payment-confirmed error', err);
    res.status(500).json({ error: "Erreur lors de l'envoi de l'email." });
  }
};
