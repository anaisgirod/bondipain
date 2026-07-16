const { getSupabaseAdmin } = require('./_supabaseAdmin');

// Inscription publique à la newsletter.
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { email, lang } = req.body || {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Email invalide.' });
    return;
  }
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin
      .from('newsletter_subscribers')
      .upsert(
        { email: email.toLowerCase().trim(), lang: lang === 'en' ? 'en' : 'fr', active: true },
        { onConflict: 'email' }
      );
    if (error) throw error;
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('newsletter-subscribe error', err);
    res.status(500).json({ error: "Erreur lors de l'inscription." });
  }
};
