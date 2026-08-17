const { getSupabaseAdmin } = require('./_supabaseAdmin');
const { sendEmail, wrap, itemsTable, money } = require('./_email');

// Passerelle de paiement MIPS (MCB) — création de paiement + réception du callback IMN.
// Les identifiants sont lus depuis les variables d'environnement Vercel (jamais en dur).
const MIPS_BASE = (process.env.MIPS_BASE_URL || 'https://api.mips.mu/api').replace(/\/+$/, '');
const SITE = process.env.SITE_URL || 'https://www.bondipain.com';
// MIPS EXIGE un header user-agent façon navigateur : sans lui, la couche sécurité MIPS
// bloque la requête (redirection « denied-by-security » / HTTP 500).
const MIPS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
function mipsHeaders() {
  return { 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': MIPS_UA, ...basicAuthHeader() };
}

function authentify() {
  return {
    id_merchant: process.env.MIPS_MERCHANT_ID,
    id_entity: process.env.MIPS_ID_ENTITY,
    id_operator: process.env.MIPS_ID_OPERATOR,
    operator_password: process.env.MIPS_OPERATOR_PASSWORD,
  };
}
function basicAuthHeader() {
  const u = process.env.MIPS_AUTH_USERNAME, p = process.env.MIPS_AUTH_PASSWORD;
  if (!u || !p) return {};
  return { Authorization: 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64') };
}
// Vercel parse le urlencoded ; fallback si le body arrive en chaîne brute
function readBody(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') {
    try { return JSON.parse(b); } catch (e) {}
    const o = {}; new URLSearchParams(b).forEach((v, k) => { o[k] = v; }); return o;
  }
  return {};
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const sb = getSupabaseAdmin();
  const body = readBody(req);

  // Journalise tout appel entrant qui n'est pas une création (= callback IMN de MIPS),
  // pour connaître la structure exacte envoyée par MIPS (noms de champs, données chiffrées).
  if (body.action !== 'create') {
    console.log('MIPS inbound (non-create) keys=', Object.keys(body).join(','));
  }

  // ── 1) Callback IMN reçu de MIPS (paiement réussi) ──
  // MIPS peut nommer le champ chiffré de plusieurs façons selon les intégrations.
  const cryptedData = body.crypted_callback || body.crypted_data || body.response || body.data || null;
  const isImn = !!cryptedData || (body.action !== 'create' && (body.id_order || body.id_transaction));
  if (isImn) {
    try {
      // Déchiffrement des données de paiement via MIPS
      let decrypted = {};
      if (cryptedData) {
        try {
          const dRes = await fetch(`${MIPS_BASE}/decrypt_imn_data`, {
            method: 'POST',
            headers: mipsHeaders(),
            body: JSON.stringify({ authentify: authentify(), salt: process.env.MIPS_SALT, cipher_key: process.env.MIPS_CIPHER_KEY, received_crypted_data: cryptedData }),
          });
          const dRaw = await dRes.text();
          try { decrypted = JSON.parse(dRaw); } catch (e) { decrypted = {}; }
          if (dRes.status !== 200) console.warn('MIPS decrypt non-200', dRes.status, String(dRaw).slice(0, 200));
        } catch (e) { console.warn('MIPS decrypt error', e && e.message); }
      }

      // IMPORTANT : `merchant_order_id` est NOTRE référence (ex. BP2608116028).
      // `id_order` / `merchant_id_order` sont l'ID interne MIPS — NE PAS les utiliser pour retrouver la commande.
      const idOrder = decrypted.merchant_order_id || body.merchant_order_id || decrypted.order_id || null;
      // Statut du paiement : on ne confirme que si MIPS renvoie SUCCESS (ou aucun statut fourni).
      const paidOk = !decrypted.status || String(decrypted.status).toUpperCase() === 'SUCCESS';
      console.log('MIPS IMN resolved order_ref=', idOrder, '· status=', decrypted.status, '· paidOk=', paidOk);

      if (idOrder && paidOk) {
        const { data: rows } = await sb.from('orders').select('*').eq('order_ref', idOrder);
        const alreadyConfirmed = rows && rows[0] && rows[0].status === 'confirmed';
        const payRef = (decrypted && (decrypted.transaction_id || decrypted.id_transaction || decrypted.id_payment)) || null;
        const { error: updErr } = await sb.from('orders').update({ status: 'confirmed', payment_ref: payRef }).eq('order_ref', idOrder);
        if (updErr) console.warn('MIPS IMN update error', updErr.message);

        // Email de confirmation au client (une seule fois)
        if (rows && rows.length && !alreadyConfirmed && rows[0].customer_email) {
          try {
            const items = (rows[0].order_items) || [];
            const total = rows.reduce((s, r) => s + Number(r.order_total || 0), 0);
            const inner = `
              <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Bonjour ${rows[0].customer_name || ''},<br>Votre paiement a bien été reçu — votre commande est <b>confirmée</b> ✅</p>
              <div style="background:#FDF1E5;border-radius:12px;padding:14px 16px;margin-bottom:18px;">
                <div style="font-size:13px;color:#837A70;">N° de commande</div>
                <div style="font-family:Georgia,serif;font-weight:bold;font-size:20px;color:#DA4928;">${idOrder}</div>
              </div>
              ${itemsTable(items)}
              <table style="width:100%;border-collapse:collapse;font-size:16px;margin-top:12px;">
                <tr><td style="padding:10px 0;font-weight:bold;">Total payé</td>
                <td style="padding:10px 0;text-align:right;font-weight:bold;color:#DA4928;">${money(total)}</td></tr>
              </table>
              <p style="font-size:14px;color:#837A70;margin-top:16px;">Livraison entre 11h et 14h · Zone d'Ébène. Merci pour votre commande !</p>`;
            const sent = await sendEmail({ to: rows[0].customer_email, subject: `Paiement reçu — commande ${idOrder} confirmée`, html: wrap('Paiement reçu ✓', inner) });
            if (sent && sent.error) console.warn('MIPS confirm email rejected', sent.error.statusCode, sent.error.message);
          } catch (e) { console.warn('MIPS confirm email error', e && e.message); }
        }
      }
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error('mips callback error', err);
      res.status(200).json({ ok: false }); // 200 pour éviter les retries en boucle de MIPS
    }
    return;
  }

  // ── 2) Création d'un paiement (appel depuis le site) ──
  if (body.action === 'create') {
    try {
      const { orderRef, days, total, name, email, phone, addr } = body;
      if (!orderRef || !email || !(Number(total) > 0) || !Array.isArray(days) || !days.length) {
        res.status(400).json({ error: 'Commande invalide.' }); return;
      }
      // MIPS exige un id_order strictement alphanumérique (regex [A-Za-z0-9], 5–25 car.).
      // On normalise (retrait des tirets, etc.) et on stocke CE MÊME identifiant en base,
      // pour que le callback IMN (qui renvoie cet id_order) retrouve bien la commande.
      const idOrder = String(orderRef).replace(/[^A-Za-z0-9]/g, '').slice(0, 25);
      if (idOrder.length < 5) { res.status(400).json({ error: 'Référence de commande invalide.' }); return; }
      // Enregistre la commande en « en attente de paiement »
      const rows = days.map((d) => ({
        order_ref: idOrder,
        order_items: d.items || [],
        order_total: Math.round(Number(d.total) || 0),
        payment_method: 'card',
        delivery_date: d.date || null,
        customer_name: name || null,
        customer_phone: phone || null,
        customer_email: email || null,
        delivery_address: addr || null,
        status: 'pending_payment',
      }));
      const { error: insErr } = await sb.from('orders').insert(rows);
      if (insErr) { console.error('MIPS order insert error', insErr.message); res.status(500).json({ error: 'Erreur enregistrement commande.' }); return; }

      const parts = String(name || 'Client').trim().split(/\s+/);
      const firstName = parts.shift() || 'Client';
      const lastName = parts.join(' ') || '-';
      const payReq = {
        authentify: authentify(),
        request: {
          request_mode: 'simple',
          sending_mode: 'link', // MIPS renvoie le lien de paiement (pas d'email envoyé par MIPS)
          request_title: 'Commande Bondipain ' + idOrder,
          client_details: { first_name: firstName, last_name: lastName, client_email: email, phone_number: phone || '' },
        },
        initial_payment: { id_order: idOrder, currency: 'MUR', amount: Number(Number(total).toFixed(2)) },
        iframe_behavior: { custom_redirection_url: `${SITE}/?mips=success&ref=${encodeURIComponent(idOrder)}` },
      };
      const mRes = await fetch(`${MIPS_BASE}/create_payment_request`, {
        method: 'POST',
        headers: mipsHeaders(),
        body: JSON.stringify(payReq),
      });
      const raw = await mRes.text();
      let data = {};
      try { data = JSON.parse(raw); } catch (e) {}
      const url = data && data.payment_link && data.payment_link.url;
      if (data.operation_status !== 'success' || !url) {
        // Détail complet côté logs serveur uniquement (MIPS peut répondre en HTML si sécurité/IP).
        console.error('MIPS create failed', mRes.status, String(raw).slice(0, 300));
        res.status(502).json({ error: data.operation_details || 'Échec de la création du paiement.' });
        return;
      }
      res.status(200).json({ url });
    } catch (err) {
      console.error('mips create error', err);
      res.status(500).json({ error: 'Erreur serveur (paiement).' });
    }
    return;
  }

  res.status(400).json({ error: 'Requête invalide.' });
};
