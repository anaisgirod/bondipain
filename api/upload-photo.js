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

// Upload d'une photo dans le bucket 'products' via service role → contourne le RLS du storage.
// Body : { path, base64, contentType }
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const sb = getSupabaseAdmin();
  try {
    const admin = await getAdmin(req, sb);
    if (!admin) { res.status(403).json({ error: 'Accès réservé à Bondipain.' }); return; }
    const { path, base64, contentType } = req.body || {};
    if (!path || !base64) { res.status(400).json({ error: 'Fichier manquant.' }); return; }
    const buffer = Buffer.from(base64, 'base64');
    const { error } = await sb.storage.from('products').upload(path, buffer, {
      contentType: contentType || 'image/jpeg',
      upsert: true,
    });
    if (error) { res.status(500).json({ error: error.message }); return; }
    const url = sb.storage.from('products').getPublicUrl(path).data.publicUrl;
    res.status(200).json({ ok: true, url });
  } catch (err) {
    console.error('upload-photo error', err);
    res.status(500).json({ error: 'Erreur serveur lors de l\'upload.' });
  }
};
