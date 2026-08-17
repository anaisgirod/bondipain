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

const pad = (n) => String(n).padStart(2, '0');
function monthStartISO() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}
// Bornes de la période de facturation courante selon le mode (mensuel ou toutes les 2 semaines)
function periodBoundsFor(billingPeriod) {
  const now = new Date();
  const y = now.getUTCFullYear(), m = now.getUTCMonth(), d = now.getUTCDate();
  let start, end;
  if (billingPeriod === 'biweekly') {
    if (d <= 15) { start = new Date(Date.UTC(y, m, 1)); end = new Date(Date.UTC(y, m, 16)); }
    else { start = new Date(Date.UTC(y, m, 16)); end = new Date(Date.UTC(y, m + 1, 1)); }
  } else {
    start = new Date(Date.UTC(y, m, 1)); end = new Date(Date.UTC(y, m + 1, 1));
  }
  const startDate = `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-${pad(start.getUTCDate())}`;
  return { startDate, startISO: start.toISOString(), endISO: end.toISOString() };
}
// Bornes d'un mois calendaire précis (YYYY-MM) — utilisé pour facturer un mois passé.
function monthBounds(monthStr) {
  const now = new Date();
  let y = now.getUTCFullYear(), m = now.getUTCMonth();
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) { y = +monthStr.slice(0, 4); m = +monthStr.slice(5, 7) - 1; }
  const start = new Date(Date.UTC(y, m, 1)), end = new Date(Date.UTC(y, m + 1, 1));
  return { startDate: `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-01`, startISO: start.toISOString(), endISO: end.toISOString() };
}
function reportMonthBounds(monthStr) {
  const now = new Date();
  let y = now.getUTCFullYear(), m = now.getUTCMonth();
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) { y = +monthStr.slice(0, 4); m = +monthStr.slice(5, 7) - 1; }
  return { startISO: new Date(Date.UTC(y, m, 1)).toISOString(), endISO: new Date(Date.UTC(y, m + 1, 1)).toISOString(), label: `${y}-${String(m + 1).padStart(2, '0')}` };
}
function reportBounds(q) {
  q = q || {};
  const D = /^\d{4}-\d{2}-\d{2}$/;
  if (D.test(q.from || '') && D.test(q.to || '')) {
    const start = new Date(q.from + 'T00:00:00.000Z');
    const end = new Date(q.to + 'T00:00:00.000Z'); end.setUTCDate(end.getUTCDate() + 1); // 'to' inclus
    return { startISO: start.toISOString(), endISO: end.toISOString(), label: `${q.from} → ${q.to}` };
  }
  return reportMonthBounds(q.month);
}
function itemName(it) {
  if (!it) return 'Repas';
  if (it.name) return typeof it.name === 'string' ? it.name : (it.name.fr || it.name.en || 'Repas');
  return it.label || 'Repas';
}
function countItems(items) { return (items || []).reduce((s, it) => s + (Number(it.qty) || 1), 0); }
function slugCode(name) {
  const base = (name || 'ENT').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 12) || 'ENT';
  return base + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
}

module.exports = async (req, res) => {
  const sb = getSupabaseAdmin();
  try {
    const admin = await getAdmin(req, sb);
    if (!admin) { res.status(403).json({ error: 'Accès réservé à Bondipain.' }); return; }

    // ── REPORTING mensuel (Particulier + Entreprises) ──
    if (req.method === 'GET' && req.query.report) {
      const { startISO, endISO, label } = reportBounds(req.query);
      // Période précédente de même durée (pour la comparaison)
      const durMs = new Date(endISO).getTime() - new Date(startISO).getTime();
      const prevStartISO = new Date(new Date(startISO).getTime() - durMs).toISOString();
      const prevEndISO = startISO;
      const [{ data: b2c }, { data: b2e }, { data: cos }, { data: pB2c }, { data: pB2e }] = await Promise.all([
        sb.from('orders').select('order_items, order_total, payment_method, status, created_at').gte('created_at', startISO).lt('created_at', endISO),
        sb.from('b2e_orders').select('order_items, order_total, employer_contribution, employee_amount, company_id, status, created_at').gte('created_at', startISO).lt('created_at', endISO),
        sb.from('companies').select('id, name'),
        sb.from('orders').select('order_items, order_total, status').gte('created_at', prevStartISO).lt('created_at', prevEndISO),
        sb.from('b2e_orders').select('order_items, order_total, status').gte('created_at', prevStartISO).lt('created_at', prevEndISO),
      ]);
      const nameById = Object.fromEntries((cos || []).map(c => [c.id, c.name]));
      const okC = (b2c || []).filter(o => o.status !== 'cancelled');
      const okE = (b2e || []).filter(o => o.status !== 'cancelled');
      const dishes = {};
      const addDish = (items, b) => (items || []).forEach(it => { const n = itemName(it), q = Number(it.qty) || 1; dishes[n] = dishes[n] || { name: n, total: 0, b2c: 0, b2e: 0 }; dishes[n].total += q; dishes[n][b] += q; });
      okC.forEach(o => addDish(o.order_items, 'b2c'));
      okE.forEach(o => addDish(o.order_items, 'b2e'));
      const topDishes = Object.values(dishes).sort((a, b) => b.total - a.total).slice(0, 10);
      const payB2c = {}; okC.forEach(o => { const m = o.payment_method || 'autre'; payB2c[m] = (payB2c[m] || 0) + Number(o.order_total || 0); });
      const byCo = {}; okE.forEach(o => { const id = o.company_id || '—'; byCo[id] = byCo[id] || { name: nameById[id] || '—', orders: 0, menus: 0, revenue: 0, employer: 0 }; byCo[id].orders += 1; byCo[id].menus += countItems(o.order_items); byCo[id].revenue += Number(o.order_total || 0); byCo[id].employer += Number(o.employer_contribution || 0); });
      const topCompanies = Object.values(byCo).sort((a, b) => b.employer - a.employer).slice(0, 10);
      const sum = (arr, f) => arr.reduce((s, o) => s + Number(f(o) || 0), 0);
      // Totaux période précédente (menus + CA, tous canaux)
      const pOk = [...(pB2c || []), ...(pB2e || [])].filter(o => o.status !== 'cancelled');
      const previous = {
        menus: pOk.reduce((s, o) => s + countItems(o.order_items), 0),
        revenue: pOk.reduce((s, o) => s + Number(o.order_total || 0), 0),
        orders: pOk.length,
      };
      res.status(200).json({
        month: label,
        b2c: { orders: okC.length, menus: okC.reduce((s, o) => s + countItems(o.order_items), 0), revenue: sum(okC, o => o.order_total), byPayment: payB2c },
        b2e: { orders: okE.length, menus: okE.reduce((s, o) => s + countItems(o.order_items), 0), revenue: sum(okE, o => o.order_total), employerTotal: sum(okE, o => o.employer_contribution), employeeTotal: sum(okE, o => o.employee_amount) },
        previous, topDishes, topCompanies,
      });
      return;
    }

    // ── DÉTAIL d'une entreprise ──
    if (req.method === 'GET' && req.query.companyId) {
      const cid = req.query.companyId;
      const [{ data: company }, { data: employees }, { data: offices }, { data: rules }, { data: orders }, invRes] = await Promise.all([
        sb.from('companies').select('*').eq('id', cid).maybeSingle(),
        sb.from('employees').select('id, full_name, work_email, phone, status, office_id, created_at').eq('company_id', cid).order('created_at', { ascending: false }),
        sb.from('company_offices').select('id, name, address, delivery_slot, active').eq('company_id', cid),
        sb.from('contribution_rules').select('*').eq('company_id', cid).eq('active', true).order('priority', { ascending: false }),
        sb.from('b2e_orders').select('order_ref, order_total, employer_contribution, employee_amount, delivery_date, status, created_at').eq('company_id', cid).order('created_at', { ascending: false }).limit(80),
        sb.from('company_invoices').select('*').eq('company_id', cid).order('period_month', { ascending: false }),
      ]);
      // Mois sélectionné (YYYY-MM) → facturation d'un mois précis (passé compris) ; sinon période courante.
      const selMonth = req.query.month;
      const pb = (selMonth && /^\d{4}-\d{2}$/.test(selMonth)) ? monthBounds(selMonth) : periodBoundsFor(company?.billing_period);
      // Commandes de la période ciblée (requête dédiée, non limitée aux 80 récentes) pour un montant et un PDF corrects.
      const { data: periodOrders } = await sb.from('b2e_orders')
        .select('order_ref, order_total, employer_contribution, employee_amount, delivery_date, status, created_at')
        .eq('company_id', cid).gte('created_at', pb.startISO).lt('created_at', pb.endISO)
        .order('created_at', { ascending: true });
      const periodOwed = (periodOrders || []).filter(o => o.status !== 'cancelled').reduce((s, o) => s + Number(o.employer_contribution || 0), 0);
      const currentInvoice = (invRes?.data || []).find(i => i.period_month === pb.startDate) || null;
      res.status(200).json({ company, employees: employees || [], offices: offices || [], rules: rules || [], orders: orders || [], periodOrders: periodOrders || [], invoices: invRes?.data || [], periodOwed, currentInvoice, period: pb, selectedMonth: pb.startDate.slice(0, 7), billingPeriod: company?.billing_period || 'monthly' });
      return;
    }

    // ── LISTE ──
    if (req.method === 'GET') {
      const mStart = monthStartISO();
      const [{ data: companies }, { data: emps }, { data: orders }, invRes] = await Promise.all([
        sb.from('companies').select('*').order('created_at', { ascending: false }),
        sb.from('employees').select('company_id, status'),
        sb.from('b2e_orders').select('company_id, employer_contribution, created_at, status').gte('created_at', mStart),
        sb.from('company_invoices').select('company_id, period_month, status').gte('period_month', new Date(mStart).toISOString().slice(0, 10)),
      ]);
      const empByCo = {}; (emps || []).forEach(e => { if (e.status !== 'removed') empByCo[e.company_id] = (empByCo[e.company_id] || 0) + 1; });
      const list = (companies || []).map(c => {
        const pb = periodBoundsFor(c.billing_period);
        const co = (orders || []).filter(o => o.company_id === c.id && o.status !== 'cancelled' && o.created_at >= pb.startISO && o.created_at < pb.endISO);
        const owed = co.reduce((s, o) => s + Number(o.employer_contribution || 0), 0);
        const inv = (invRes?.data || []).find(i => i.company_id === c.id && i.period_month === pb.startDate);
        return { ...c, employees_count: empByCo[c.id] || 0, period_owed: owed, period_orders: co.length, period_invoice_status: inv ? inv.status : null, billing_period: c.billing_period || 'monthly' };
      });
      res.status(200).json({ companies: list });
      return;
    }

    // ── SUPPRIMER ──
    if (req.method === 'DELETE') {
      const cid = req.query.companyId || (req.body && req.body.companyId);
      if (!cid) { res.status(400).json({ error: 'companyId requis.' }); return; }
      await sb.from('b2e_orders').delete().eq('company_id', cid);
      await sb.from('company_invoices').delete().eq('company_id', cid);
      const { error } = await sb.from('companies').delete().eq('id', cid);
      if (error) { res.status(500).json({ error: 'Suppression impossible : ' + error.message }); return; }
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const action = body.action || 'create';

      if (action === 'set_active') {
        const { error } = await sb.from('companies').update({ active: body.active !== false }).eq('id', body.companyId);
        if (error) { res.status(500).json({ error: error.message }); return; }
        res.status(200).json({ ok: true }); return;
      }

      if (action === 'update_company') {
        const { companyId, name, contactEmail, mode, amount, percent, monthlyCap, monthlyMealCap, officeName } = body;
        if (!companyId) { res.status(400).json({ error: 'companyId requis.' }); return; }
        const upd = {};
        if (name != null && name !== '') upd.name = name;
        if (contactEmail != null && contactEmail !== '') upd.contact_email = contactEmail.trim().toLowerCase();
        if (mode === 'percent') upd.subsidy_pct = parseInt(percent, 10) || 50;
        if (Object.keys(upd).length) { const { error } = await sb.from('companies').update(upd).eq('id', companyId); if (error) { res.status(500).json({ error: error.message }); return; } }
        const ruleData = {
          mode: mode === 'fixed' ? 'fixed' : 'percent',
          amount: mode === 'fixed' ? (parseInt(amount, 10) || 0) : null,
          percent: mode === 'percent' ? (parseInt(percent, 10) || 50) : null,
          monthly_cap: monthlyCap ? parseInt(monthlyCap, 10) : null,
          monthly_meal_cap: monthlyMealCap ? parseInt(monthlyMealCap, 10) : null,
        };
        const { data: rules } = await sb.from('contribution_rules').select('id').eq('company_id', companyId).eq('active', true).order('priority', { ascending: false }).limit(1);
        if (rules && rules.length) await sb.from('contribution_rules').update(ruleData).eq('id', rules[0].id);
        else await sb.from('contribution_rules').insert({ company_id: companyId, name: 'Règle par défaut', ...ruleData, active: true, priority: 0 });
        if (officeName != null && officeName !== '') {
          const { data: offs } = await sb.from('company_offices').select('id').eq('company_id', companyId).order('created_at').limit(1);
          if (offs && offs.length) await sb.from('company_offices').update({ name: officeName }).eq('id', offs[0].id);
          else await sb.from('company_offices').insert({ company_id: companyId, name: officeName, active: true });
        }
        res.status(200).json({ ok: true });
        return;
      }

      if (action === 'add_office') {
        const { companyId, name } = body;
        if (!companyId || !name || !String(name).trim()) { res.status(400).json({ error: 'Nom du bureau requis.' }); return; }
        const { error } = await sb.from('company_offices').insert({ company_id: companyId, name: String(name).trim(), active: true });
        if (error) { res.status(500).json({ error: error.message }); return; }
        res.status(200).json({ ok: true }); return;
      }
      if (action === 'rename_office') {
        const { officeId, name } = body;
        if (!officeId || !name || !String(name).trim()) { res.status(400).json({ error: 'Nom du bureau requis.' }); return; }
        const { error } = await sb.from('company_offices').update({ name: String(name).trim() }).eq('id', officeId);
        if (error) { res.status(500).json({ error: error.message }); return; }
        res.status(200).json({ ok: true }); return;
      }
      if (action === 'remove_office') {
        const { officeId } = body;
        if (!officeId) { res.status(400).json({ error: 'officeId requis.' }); return; }
        const { error } = await sb.from('company_offices').delete().eq('id', officeId);
        if (error) { res.status(500).json({ error: 'Suppression impossible (bureau peut-être utilisé) : ' + error.message }); return; }
        res.status(200).json({ ok: true }); return;
      }

      if (action === 'set_period') {
        const period = body.billingPeriod === 'biweekly' ? 'biweekly' : 'monthly';
        const { error } = await sb.from('companies').update({ billing_period: period }).eq('id', body.companyId);
        if (error) { res.status(500).json({ error: error.message }); return; }
        res.status(200).json({ ok: true }); return;
      }

      if (action === 'invoice') {
        const cid = body.companyId;
        const { data: company } = await sb.from('companies').select('billing_period').eq('id', cid).maybeSingle();
        // Mois précis fourni (YYYY-MM) → facture ce mois-là ; sinon période courante.
        const pb = (body.periodMonth && /^\d{4}-\d{2}$/.test(body.periodMonth)) ? monthBounds(body.periodMonth) : periodBoundsFor(company?.billing_period);
        const { data: orders } = await sb.from('b2e_orders').select('employer_contribution, status, created_at').eq('company_id', cid).gte('created_at', pb.startISO).lt('created_at', pb.endISO);
        const amount = (orders || []).filter(o => o.status !== 'cancelled').reduce((s, o) => s + Number(o.employer_contribution || 0), 0);
        const { data: inv, error } = await sb.from('company_invoices')
          .upsert({ company_id: cid, period_month: pb.startDate, amount, status: 'invoiced', updated_at: new Date().toISOString() }, { onConflict: 'company_id,period_month' })
          .select().single();
        if (error) { res.status(500).json({ error: 'Erreur facture : ' + error.message }); return; }
        res.status(200).json({ ok: true, invoice: inv }); return;
      }

      if (action === 'mark_paid') {
        const { data: company } = await sb.from('companies').select('billing_period').eq('id', body.companyId).maybeSingle();
        const pb = periodBoundsFor(company?.billing_period);
        const { error } = await sb.from('company_invoices')
          .update({ status: body.paid === false ? 'invoiced' : 'paid', updated_at: new Date().toISOString() })
          .eq('company_id', body.companyId).eq('period_month', body.periodMonth || pb.startDate);
        if (error) { res.status(500).json({ error: error.message }); return; }
        res.status(200).json({ ok: true }); return;
      }

      // ── CRÉER ──
      const { name, contactEmail, mode, amount, percent, monthlyCap, monthlyMealCap, officeName, officeSlot, billingPeriod, invite } = body;
      if (!name || !contactEmail) { res.status(400).json({ error: 'Nom et email de contact requis.' }); return; }
      const { data: company, error: cErr } = await sb.from('companies')
        .insert({ name, promo_code: slugCode(name), contact_email: contactEmail.trim().toLowerCase(), subsidy_pct: mode === 'percent' ? (parseInt(percent, 10) || 50) : 50, billing_period: billingPeriod === 'biweekly' ? 'biweekly' : 'monthly', active: true })
        .select().single();
      if (cErr) { res.status(500).json({ error: 'Erreur création entreprise : ' + cErr.message }); return; }
      await sb.from('contribution_rules').insert({
        company_id: company.id, name: 'Règle par défaut',
        mode: mode === 'fixed' ? 'fixed' : 'percent',
        amount: mode === 'fixed' ? (parseInt(amount, 10) || 0) : null,
        percent: mode === 'percent' ? (parseInt(percent, 10) || 50) : null,
        monthly_cap: monthlyCap ? parseInt(monthlyCap, 10) : null,
        monthly_meal_cap: monthlyMealCap ? parseInt(monthlyMealCap, 10) : null,
        active: true, priority: 0,
      });
      if (officeName) await sb.from('company_offices').insert({ company_id: company.id, name: officeName, delivery_slot: officeSlot || null, active: true });
      let inviteStatus = 'skipped';
      if (invite !== false) {
        const { error: iErr } = await sb.auth.admin.inviteUserByEmail(contactEmail.trim().toLowerCase(), { redirectTo: 'https://www.bondipain.com/employeur.html' });
        inviteStatus = iErr ? ('error: ' + iErr.message) : 'sent';
      }
      res.status(200).json({ ok: true, company, inviteStatus }); return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('admin-companies error', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
};
