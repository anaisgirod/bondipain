const { getSupabaseAdmin } = require('./_supabaseAdmin');

async function getEmployerCompany(req, supabaseAdmin) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user?.email) return null;

  const { data: company, error: companyError } = await supabaseAdmin
    .from('companies')
    .select('*')
    .eq('contact_email', userData.user.email)
    .single();
  if (companyError || !company) return null;

  return company;
}

function toCsvValue(value) {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const company = await getEmployerCompany(req, supabaseAdmin);
    if (!company) {
      res.status(401).json({ error: 'Accès réservé au RH de l\'entreprise.' });
      return;
    }

    const { from, to } = req.query || {};

    let query = supabaseAdmin
      .from('b2e_orders')
      .select('order_ref, delivery_date, employee_id, order_total, employer_contribution, employee_amount, payment_method, status, employees(full_name, work_email)')
      .eq('company_id', company.id)
      .order('delivery_date', { ascending: true });
    if (from) query = query.gte('delivery_date', from);
    if (to) query = query.lte('delivery_date', to);

    const { data: orders, error } = await query;
    if (error) throw error;

    const header = ['Référence', 'Date livraison', 'Employé', 'Email', 'Total repas', 'Contribution entreprise', 'Payé par employé', 'Paiement', 'Statut'];
    const rows = (orders || []).map((o) => [
      o.order_ref,
      o.delivery_date,
      o.employees?.full_name || '',
      o.employees?.work_email || '',
      o.order_total,
      o.employer_contribution,
      o.employee_amount,
      o.payment_method,
      o.status,
    ]);

    const csv = [header, ...rows].map((row) => row.map(toCsvValue).join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="bondipain-${company.name}-facture.csv"`);
    res.status(200).send(csv);
  } catch (err) {
    console.error('export-invoice error', err);
    res.status(500).json({ error: "Erreur lors de l'export." });
  }
};
