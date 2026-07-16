const { getSupabaseAdmin } = require('./_supabaseAdmin');
const { sendEmail, wrap, money } = require('./_email');

async function getEmployerCompany(req, supabaseAdmin) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user?.email) return null;
  const { data: company, error } = await supabaseAdmin
    .from('companies').select('*').eq('contact_email', userData.user.email).single();
  if (error || !company) return null;
  return { company, requesterEmail: userData.user.email };
}

// Envoi de la facture mensuelle par email à l'entreprise — déclenché depuis le portail RH.
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const ctx = await getEmployerCompany(req, supabaseAdmin);
    if (!ctx) { res.status(401).json({ error: "Accès réservé au RH de l'entreprise." }); return; }
    const { company, requesterEmail } = ctx;
    const { from, to, periodLabel } = req.body || {};

    let query = supabaseAdmin
      .from('b2e_orders')
      .select('order_ref, delivery_date, order_total, employer_contribution, employee_amount, status, employees(full_name)')
      .eq('company_id', company.id)
      .neq('status', 'cancelled')
      .order('delivery_date', { ascending: true });
    if (from) query = query.gte('delivery_date', from);
    if (to) query = query.lte('delivery_date', to);
    const { data: orders, error } = await query;
    if (error) throw error;

    const totalCompany = (orders || []).reduce((s, o) => s + Number(o.employer_contribution || 0), 0);
    const totalMeals = (orders || []).length;

    const rows = (orders || []).map((o) => `<tr>
      <td style="padding:6px 0;border-bottom:1px solid #EFE3D5;font-size:13px;">${o.delivery_date} · ${o.employees?.full_name || ''}</td>
      <td style="padding:6px 0;border-bottom:1px solid #EFE3D5;text-align:right;font-size:13px;">${money(o.employer_contribution)}</td>
    </tr>`).join('');

    const inner = `
      <p style="font-size:15px;line-height:1.6;">Facture de l'avantage repas pour <b>${company.name}</b>${periodLabel ? ` — <b>${periodLabel}</b>` : ''}.</p>
      <div style="background:#FDF1E5;border-radius:12px;padding:16px;margin:16px 0;">
        <div style="display:flex;justify-content:space-between;font-size:15px;"><span>Repas subventionnés</span><b>${totalMeals}</b></div>
        <div style="display:flex;justify-content:space-between;font-size:20px;margin-top:8px;"><span style="font-weight:bold;">Total à facturer</span><b style="color:#C9711B;">${money(totalCompany)}</b></div>
      </div>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
      <p style="font-size:12px;color:#837A70;margin-top:18px;">Document généré automatiquement par Bondipain. Un export CSV détaillé est disponible dans votre portail employeur.</p>`;

    const subject = `Facture Bondipain — ${company.name}${periodLabel ? ' · ' + periodLabel : ''}`;
    const html = wrap('Votre facture Bondipain', inner);
    const recipient = company.contact_email || requesterEmail;
    await sendEmail({ to: recipient, subject, html });
    res.status(200).json({ ok: true, to: recipient, total: totalCompany, meals: totalMeals });
  } catch (err) {
    console.error('send-invoice error', err);
    res.status(500).json({ error: "Erreur lors de l'envoi de la facture." });
  }
};
