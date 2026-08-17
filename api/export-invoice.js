const { getSupabaseAdmin } = require('./_supabaseAdmin');
const { sendEmail, wrap, money } = require('./_email');

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

  // ── POST : envoi de la facture mensuelle par email (fusionné depuis send-invoice) ──
  if (req.method === 'POST') {
    try {
      const company = await getEmployerCompany(req, supabaseAdmin);
      if (!company) { res.status(401).json({ error: "Accès réservé au RH de l'entreprise." }); return; }
      const { from, to, periodLabel } = req.body || {};
      let q = supabaseAdmin
        .from('b2e_orders')
        .select('order_ref, delivery_date, order_total, employer_contribution, employee_amount, status, employees(full_name)')
        .eq('company_id', company.id).neq('status', 'cancelled').order('delivery_date', { ascending: true });
      if (from) q = q.gte('delivery_date', from);
      if (to) q = q.lte('delivery_date', to);
      const { data: orders, error } = await q;
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
      const recipient = company.contact_email;
      await sendEmail({ to: recipient, subject: `Facture Bondipain — ${company.name}${periodLabel ? ' · ' + periodLabel : ''}`, html: wrap('Votre facture Bondipain', inner) });
      res.status(200).json({ ok: true, to: recipient, total: totalCompany, meals: totalMeals });
    } catch (err) { console.error('send-invoice error', err); res.status(500).json({ error: "Erreur lors de l'envoi de la facture." }); }
    return;
  }

  try {
    const company = await getEmployerCompany(req, supabaseAdmin);
    if (!company) {
      res.status(401).json({ error: 'Accès réservé au RH de l\'entreprise.' });
      return;
    }

    const { from, to, summary } = req.query || {};

    let query = supabaseAdmin
      .from('b2e_orders')
      .select('order_ref, delivery_date, employee_id, order_items, order_total, employer_contribution, employee_amount, payment_method, status, employees(full_name, work_email, department)')
      .eq('company_id', company.id)
      .order('delivery_date', { ascending: true });
    if (from) query = query.gte('delivery_date', from);
    if (to) query = query.lte('delivery_date', to);

    const { data: orders, error } = await query;
    if (error) throw error;

    // Nombre de plats d'une commande = somme des quantités des articles (les boissons/condiments sont imbriqués dans chaque article, pas comptés comme plats).
    const mealCount = (o) => (Array.isArray(o.order_items) ? o.order_items : []).reduce((s, it) => s + (Number(it.qty) || 1), 0);
    // Libellé lisible des menus d'une commande, ex. « 2× Vegetable Curry ; 1× Chicken Fried Noodles ».
    const itemName = (it) => {
      const n = it && it.name;
      if (!n) return it && it.label ? String(it.label) : '';
      if (typeof n === 'string') return n;
      return n.fr || n.en || Object.values(n)[0] || '';
    };
    const menuStr = (o) => (Array.isArray(o.order_items) ? o.order_items : [])
      .map((it) => `${Number(it.qty) || 1}× ${itemName(it)}`.trim())
      .filter(Boolean)
      .join(' ; ');

    let header, rows, filename;

    if (summary === 'employee') {
      // ── Récap par employé : 1 ligne par employé ──
      const byEmp = {};
      for (const o of orders || []) {
        const key = o.employee_id || o.employees?.work_email || o.order_ref;
        if (!byEmp[key]) byEmp[key] = { name: o.employees?.full_name || '', email: o.employees?.work_email || '', department: o.employees?.department || '', meals: 0, orders: 0, contribution: 0, employeePaid: 0, menus: [] };
        const e = byEmp[key];
        e.meals += mealCount(o);
        e.orders += 1;
        e.contribution += Number(o.employer_contribution || 0);
        e.employeePaid += Number(o.employee_amount || 0);
        const m = menuStr(o);
        if (m) e.menus.push(m);
      }
      const list = Object.values(byEmp).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      header = ['Employé', 'Email', 'Département', 'Menus commandés', 'Nombre de plats', 'Commandes', 'Contribution entreprise (Rs)', 'Payé par employé (Rs)'];
      rows = list.map((e) => [e.name, e.email, e.department, e.menus.join(' | '), e.meals, e.orders, Math.round(e.contribution), Math.round(e.employeePaid)]);
      // Ligne de total
      const totMeals = list.reduce((s, e) => s + e.meals, 0);
      const totOrders = list.reduce((s, e) => s + e.orders, 0);
      const totContrib = list.reduce((s, e) => s + e.contribution, 0);
      const totPaid = list.reduce((s, e) => s + e.employeePaid, 0);
      rows.push(['TOTAL', '', '', '', totMeals, totOrders, Math.round(totContrib), Math.round(totPaid)]);
      filename = `bondipain-${company.name}-recap-employes.csv`;
    } else {
      // ── Détail : 1 ligne par commande ──
      header = ['Référence', 'Date livraison', 'Employé', 'Email', 'Département', 'Menus commandés', 'Nombre de plats', 'Total commande (Rs)', 'Contribution entreprise (Rs)', 'Payé par employé (Rs)', 'Paiement', 'Statut'];
      rows = (orders || []).map((o) => [
        o.order_ref,
        o.delivery_date,
        o.employees?.full_name || '',
        o.employees?.work_email || '',
        o.employees?.department || '',
        menuStr(o),
        mealCount(o),
        o.order_total,
        o.employer_contribution,
        o.employee_amount,
        o.payment_method,
        o.status,
      ]);
      filename = `bondipain-${company.name}-facture.csv`;
    }

    const csv = [header, ...rows].map((row) => row.map(toCsvValue).join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send('﻿' + csv);
  } catch (err) {
    console.error('export-invoice error', err);
    res.status(500).json({ error: "Erreur lors de l'export." });
  }
};
