const { getSupabaseAdmin } = require('./_supabaseAdmin');
const { sendEmail, wrap } = require('./_email');

const ADMIN_EMAIL = 'hello@bondipain.com';

async function getAdmin(req, supabaseAdmin) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.email === ADMIN_EMAIL ? data.user : null;
}

// Envoi d'une newsletter à tous les abonnés actifs — réservé à l'admin Bondipain.
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
    const { subject, body, test } = req.body || {};
    if (!subject || !body) {
      res.status(400).json({ error: 'Sujet et contenu requis.' });
      return;
    }
    // body : texte simple → paragraphes HTML (les retours à la ligne deviennent des <br>)
    const safe = String(body).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = wrap(subject, `<div style="font-size:15px;line-height:1.7;">${safe.replace(/\n/g, '<br>')}</div>
      <p style="font-size:12px;color:#837A70;margin-top:22px;">Vous recevez cet email car vous êtes inscrit à la newsletter Bondipain.</p>`);

    // Mode test : envoi uniquement à l'admin pour prévisualiser
    if (test) {
      await sendEmail({ to: admin.email, subject: `[TEST] ${subject}`, html });
      res.status(200).json({ ok: true, sent: 1, test: true });
      return;
    }

    const { data: subs, error } = await supabaseAdmin
      .from('newsletter_subscribers')
      .select('email')
      .eq('active', true);
    if (error) throw error;
    const emails = (subs || []).map((s) => s.email).filter(Boolean);
    if (!emails.length) {
      res.status(200).json({ ok: true, sent: 0 });
      return;
    }

    // Envoi individuel (destinataires masqués). Petites listes : suffisant.
    let sent = 0;
    for (const to of emails) {
      try { await sendEmail({ to, subject, html }); sent++; } catch (e) { console.warn('newsletter to', to, e.message); }
    }
    res.status(200).json({ ok: true, sent });
  } catch (err) {
    console.error('send-newsletter error', err);
    res.status(500).json({ error: "Erreur lors de l'envoi de la newsletter." });
  }
};
