const { getSupabaseAdmin } = require('./_supabaseAdmin');

// Compte admin : info@bondipain.com. hello@ accepté le temps de la bascule du compte Supabase.
const ADMIN_EMAILS = ['info@bondipain.com', 'hello@bondipain.com', 'agirod@gramica.fr'];

async function getAdmin(req, supabaseAdmin) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  return ADMIN_EMAILS.includes((data.user.email || '').toLowerCase()) ? data.user : null;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const admin = await getAdmin(req, supabaseAdmin);
    if (!admin) {
      res.status(403).json({ error: 'Accès réservé à Bondipain.' });
      return;
    }

    const date = (req.query && req.query.date) || new Date().toISOString().slice(0, 10);

    const { data: orders, error } = await supabaseAdmin
      .from('b2e_orders')
      .select('order_ref, pickup_code, order_items, delivery_date, status, employee_amount, employer_contribution, employees(full_name, allergen_alerts), companies(name), company_offices(name, delivery_slot)')
      .eq('delivery_date', date)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true });
    if (error) throw error;

    const groups = {};
    for (const o of orders || []) {
      const company = o.companies?.name || '—';
      const office = o.company_offices?.name || 'Non défini';
      const slot = o.company_offices?.delivery_slot || '—';
      const key = `${company}||${office}||${slot}`;
      if (!groups[key]) groups[key] = { company, office, slot, orders: [], mealCounts: {}, total: 0 };
      const g = groups[key];
      const items = o.order_items || [];
      const mealLabel = items.map(it => (it.name?.fr || it.name || 'Repas')).join(' + ') || 'Repas';
      items.forEach(it => {
        const n = it.name?.fr || it.name || 'Repas';
        g.mealCounts[n] = (g.mealCounts[n] || 0) + (it.qty || 1);
      });
      g.orders.push({
        order_ref: o.order_ref,
        pickup_code: o.pickup_code,
        employee: o.employees?.full_name || 'Employé',
        company,
        meal: mealLabel,
        allergens: o.employees?.allergen_alerts || [],
        status: o.status,
      });
      g.total += 1;
    }

    // ── Commandes Particulier (B2C) pour la même date ──
    const { data: b2cOrders } = await supabaseAdmin
      .from('orders')
      .select('order_ref, order_items, delivery_date, status, customer_name, customer_phone, delivery_address')
      .eq('delivery_date', date)
      .neq('status', 'cancelled');
    for (const o of b2cOrders || []) {
      const name = o.customer_name || 'Client';
      const office = o.delivery_address ? `${name} — ${o.delivery_address}` : name;
      const items = o.order_items || [];
      const mealLabel = items.map(it => (it.name?.fr || it.name || 'Repas')).join(' + ') || 'Repas';
      const mealCounts = {};
      items.forEach(it => { const n = it.name?.fr || it.name || 'Repas'; mealCounts[n] = (mealCounts[n] || 0) + (it.qty || 1); });
      groups[`B2C||${o.order_ref}`] = {
        company: 'Particulier', office, slot: '11h–14h', mealCounts, total: 1,
        orders: [{ order_ref: o.order_ref, pickup_code: null, employee: name, phone: o.customer_phone || '', company: 'Particulier', meal: mealLabel, allergens: [], status: o.status }],
      };
    }

    const groupList = Object.values(groups).sort((a, b) => a.slot.localeCompare(b.slot) || a.office.localeCompare(b.office));
    const route = groupList.map(g => `${g.office} (${g.slot})`);

    res.status(200).json({
      date,
      totalOrders: (orders || []).length + (b2cOrders || []).length,
      groups: groupList,
      route,
    });
  } catch (err) {
    console.error('kitchen-batch error', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des commandes.' });
  }
};
