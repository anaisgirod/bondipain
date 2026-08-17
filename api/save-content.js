const { getSupabaseAdmin } = require('./_supabaseAdmin');

const ADMIN_EMAILS = ['info@bondipain.com', 'hello@bondipain.com', 'agirod@gramica.fr'];

async function getAdmin(req, sb) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  return ADMIN_EMAILS.includes((data.user.email || '').toLowerCase()) ? data.user : null;
}

function normCode(c) { return String(c || '').trim().toUpperCase().replace(/\s+/g, ''); }

// Sauvegarde du contenu éditable (site_content) via service role → contourne le RLS.
// Body : { rows: [{ key, fr, en }] }
// Gère aussi les codes promo (table promo_codes) : GET (liste) et POST { promoAction }.
module.exports = async (req, res) => {
  const sb = getSupabaseAdmin();

  // ── Codes promo : GET liste ──
  if (req.method === 'GET' && (req.query && req.query.promos)) {
    try {
      const admin = await getAdmin(req, sb);
      if (!admin) { res.status(403).json({ error: 'Accès réservé à Bondipain.' }); return; }
      const { data, error } = await sb.from('promo_codes').select('*').order('created_at', { ascending: false });
      if (error) { res.status(500).json({ error: error.message }); return; }
      res.status(200).json({ codes: data || [] });
    } catch (err) { console.error('promos list error', err); res.status(500).json({ error: 'Erreur serveur.' }); }
    return;
  }

  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  try {
    const admin = await getAdmin(req, sb);
    if (!admin) { res.status(403).json({ error: 'Accès réservé à Bondipain.' }); return; }

    // ── Codes promo : POST { promoAction: 'upsert' | 'toggle' | 'delete' } ──
    const promoAction = req.body && req.body.promoAction;
    if (promoAction) {
      const code = normCode(req.body.code);
      if (!code) { res.status(400).json({ error: 'Code requis.' }); return; }
      if (promoAction === 'delete') {
        const { error } = await sb.from('promo_codes').delete().eq('code', code);
        if (error) { res.status(500).json({ error: error.message }); return; }
        res.status(200).json({ ok: true }); return;
      }
      if (promoAction === 'toggle') {
        const { error } = await sb.from('promo_codes').update({ active: req.body.active !== false, updated_at: new Date().toISOString() }).eq('code', code);
        if (error) { res.status(500).json({ error: error.message }); return; }
        res.status(200).json({ ok: true }); return;
      }
      // upsert
      const amount = Math.max(0, parseInt(req.body.amount, 10) || 0);
      if (!amount) { res.status(400).json({ error: 'Montant de remise requis (Rs).' }); return; }
      const { error } = await sb.from('promo_codes').upsert(
        { code, amount, active: req.body.active !== false, updated_at: new Date().toISOString() },
        { onConflict: 'code' }
      );
      if (error) { res.status(500).json({ error: error.message }); return; }
      res.status(200).json({ ok: true, code, amount }); return;
    }

    const rows = (req.body && req.body.rows) || [];
    if (!Array.isArray(rows) || !rows.length) { res.status(400).json({ error: 'Aucune donnée à enregistrer.' }); return; }
    const now = new Date().toISOString();
    const payload = rows
      .filter(r => r && typeof r.key === 'string' && r.key)
      .map(r => ({ key: r.key, fr: r.fr != null ? String(r.fr) : '', en: r.en != null ? String(r.en) : '', updated_at: now }));
    if (!payload.length) { res.status(400).json({ error: 'Clés invalides.' }); return; }
    const { error } = await sb.from('site_content').upsert(payload, { onConflict: 'key' });
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(200).json({ ok: true, count: payload.length });
  } catch (err) {
    console.error('save-content error', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
};
