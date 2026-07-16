const { getSupabaseAdmin, getEmployeeFromRequest } = require('./_supabaseAdmin');
const { sendEmail, wrap, itemsTable, money } = require('./_email');

const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// Email de confirmation employé (best-effort : n'interrompt pas la commande en cas d'échec)
async function sendB2EConfirmation(order, employee, companyName) {
  const to = employee.work_email;
  if (!to) return;
  const pay = Number(order.employee_amount || 0);
  const inner = `
    <p style="font-size:15px;line-height:1.6;">Bonjour ${employee.full_name || ''},<br>Votre commande est confirmée 🎉</p>
    <div style="background:#FDF1E5;border-radius:12px;padding:14px 16px;margin:16px 0;">
      <div style="font-size:13px;color:#837A70;">N° de commande</div>
      <div style="font-family:Georgia,serif;font-weight:bold;font-size:20px;color:#C9711B;">${order.order_ref}</div>
      <div style="font-size:13px;color:#837A70;margin-top:8px;">Code de retrait : <b>${order.pickup_code || '—'}</b></div>
    </div>
    ${itemsTable(order.order_items)}
    <table style="width:100%;border-collapse:collapse;font-size:15px;margin-top:10px;">
      <tr><td style="padding:6px 0;">Pris en charge par ${companyName || 'votre entreprise'}</td><td style="padding:6px 0;text-align:right;color:#2E7D52;">−${money(order.employer_contribution)}</td></tr>
      <tr><td style="padding:6px 0;font-weight:bold;">Vous payez</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:#C9711B;">${money(pay)}</td></tr>
    </table>
    <p style="font-size:14px;color:#837A70;margin-top:16px;line-height:1.6;">Livraison le <b>${order.delivery_date}</b>, entre 11h et 14h.</p>`;
  try {
    await sendEmail({ to, subject: `Votre commande Bondipain ${order.order_ref}`, html: wrap('Commande confirmée 🎉', inner) });
  } catch (e) { console.warn('B2E confirmation email failed:', e.message); }
}

function firstOfMonth(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function makePickupCode() {
  return 'BP-' + Math.floor(1000 + Math.random() * 9000);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const employee = await getEmployeeFromRequest(req, supabaseAdmin);
    if (!employee) {
      res.status(401).json({ error: 'Session employé invalide ou expirée.' });
      return;
    }
    if (employee.status === 'removed') {
      res.status(403).json({ error: "Votre accès à l'avantage repas a été retiré." });
      return;
    }

    const { items, deliveryDate, paymentMethod, officeId, orderRef: clientOrderRef } = req.body || {};
    if (!Array.isArray(items) || items.length === 0 || !deliveryDate) {
      res.status(400).json({ error: 'Commande invalide.' });
      return;
    }

    // Restriction : un employé ne peut passer qu'une seule commande par jour de livraison
    const { data: sameDay, error: sameDayErr } = await supabaseAdmin
      .from('b2e_orders')
      .select('id')
      .eq('employee_id', employee.id)
      .eq('delivery_date', deliveryDate)
      .neq('status', 'cancelled')
      .limit(1);
    if (sameDayErr) throw sameDayErr;
    if (sameDay && sameDay.length) {
      res.status(409).json({ error: 'Vous avez déjà une commande pour ce jour. Une seule commande par jour est autorisée avec votre avantage entreprise.' });
      return;
    }

    const orderTotal = items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
    const effectiveOfficeId = officeId || employee.office_id;
    const dow = DOW[new Date(deliveryDate + 'T00:00:00Z').getUTCDay()];

    // Mode d'avantage de l'entreprise
    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('benefit_mode, show_prices')
      .eq('id', employee.company_id)
      .maybeSingle();
    const benefitMode = company?.benefit_mode || 'contribution';

    // PRIX MASQUÉS : l'entreprise prend TOUT en charge (l'employé ne voit pas les prix et ne paie rien)
    if (company && company.show_prices === false) {
      const employerContribution = Math.round(orderTotal * 100) / 100;
      const pickupCode = makePickupCode();
      const orderRef = (typeof clientOrderRef === 'string' && /^BP-[0-9A-Z-]{4,20}$/i.test(clientOrderRef))
        ? clientOrderRef
        : 'BP-' + deliveryDate.replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000);
      const { data: order, error: insertError } = await supabaseAdmin
        .from('b2e_orders')
        .insert({
          employee_id: employee.id, company_id: employee.company_id, office_id: effectiveOfficeId,
          order_ref: orderRef, order_items: items, order_total: orderTotal,
          contribution_rule_id: null, employer_contribution: employerContribution, employee_amount: 0,
          payment_method: 'offert', delivery_date: deliveryDate, pickup_code: pickupCode, status: 'confirmed',
        })
        .select().single();
      if (insertError) throw insertError;
      await sendB2EConfirmation(order, employee, null);
      res.status(200).json({ order });
      return;
    }

    // MODE « repas offert » : l'entreprise prend en charge 1 article/jour (le prix unitaire le plus élevé), les extras au tarif normal
    if (benefitMode === 'free_daily') {
      const unitPrices = items.map((it) => {
        const qty = Number(it.qty || 1) || 1;
        return Number(it.lineTotal || 0) / qty;
      });
      let employerContribution = unitPrices.length ? Math.max(...unitPrices) : 0;
      employerContribution = Math.round(Math.min(employerContribution, orderTotal) * 100) / 100;
      const employeeAmount = Math.round((orderTotal - employerContribution) * 100) / 100;
      const pickupCode = makePickupCode();
      const orderRef = (typeof clientOrderRef === 'string' && /^BP-[0-9A-Z-]{4,20}$/i.test(clientOrderRef))
        ? clientOrderRef
        : 'BP-' + deliveryDate.replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000);

      const { data: order, error: insertError } = await supabaseAdmin
        .from('b2e_orders')
        .insert({
          employee_id: employee.id,
          company_id: employee.company_id,
          office_id: effectiveOfficeId,
          order_ref: orderRef,
          order_items: items,
          order_total: orderTotal,
          contribution_rule_id: null,
          employer_contribution: employerContribution,
          employee_amount: employeeAmount,
          payment_method: employeeAmount > 0 ? (paymentMethod || 'juice') : 'offert',
          delivery_date: deliveryDate,
          pickup_code: pickupCode,
          status: 'confirmed',
        })
        .select()
        .single();
      if (insertError) throw insertError;
      await sendB2EConfirmation(order, employee, null);
      res.status(200).json({ order });
      return;
    }

    const { data: rules, error: rulesError } = await supabaseAdmin
      .from('contribution_rules')
      .select('*')
      .eq('company_id', employee.company_id)
      .eq('active', true)
      .order('priority', { ascending: false });
    if (rulesError) throw rulesError;

    const eligibleRule = (rules || []).find((rule) => {
      const days = rule.eligible_days || DOW.slice(1, 6);
      if (!days.includes(dow)) return false;
      if (rule.eligible_offices && !rule.eligible_offices.includes(effectiveOfficeId)) return false;
      if (rule.eligible_employees && !rule.eligible_employees.includes(employee.id)) return false;
      return true;
    });

    let employerContribution = 0;
    let ruleId = null;

    if (eligibleRule) {
      ruleId = eligibleRule.id;
      const eligibleSubtotal = items.reduce((sum, item) => {
        const productEligible = !eligibleRule.eligible_products || eligibleRule.eligible_products.includes(item.id);
        return productEligible ? sum + Number(item.lineTotal || 0) : sum;
      }, 0);

      employerContribution = eligibleRule.mode === 'percent'
        ? eligibleSubtotal * (Number(eligibleRule.percent || 0) / 100)
        : Math.min(Number(eligibleRule.amount || 0), eligibleSubtotal);

      if (eligibleRule.daily_cap != null) {
        const { data: todaysOrders, error: todaysError } = await supabaseAdmin
          .from('b2e_orders')
          .select('employer_contribution')
          .eq('employee_id', employee.id)
          .eq('delivery_date', deliveryDate)
          .neq('status', 'cancelled');
        if (todaysError) throw todaysError;
        const alreadyToday = (todaysOrders || []).reduce((s, o) => s + Number(o.employer_contribution || 0), 0);
        employerContribution = Math.max(0, Math.min(employerContribution, eligibleRule.daily_cap - alreadyToday));
      }

      if (eligibleRule.monthly_cap != null) {
        const periodMonth = firstOfMonth(deliveryDate);
        const { data: ledger } = await supabaseAdmin
          .from('employee_budget_ledger')
          .select('*')
          .eq('employee_id', employee.id)
          .eq('period_month', periodMonth)
          .maybeSingle();
        const alreadyThisMonth = Number(ledger?.contributed || 0);
        employerContribution = Math.max(0, Math.min(employerContribution, eligibleRule.monthly_cap - alreadyThisMonth));

        await supabaseAdmin
          .from('employee_budget_ledger')
          .upsert(
            { employee_id: employee.id, period_month: periodMonth, contributed: alreadyThisMonth + employerContribution },
            { onConflict: 'employee_id,period_month' }
          );
      }
    }

    employerContribution = Math.round(employerContribution * 100) / 100;
    const employeeAmount = Math.round((orderTotal - employerContribution) * 100) / 100;
    const pickupCode = makePickupCode();
    // On réutilise le n° généré côté client (référence Juice affichée dès l'initiation) s'il est valide
    const orderRef = (typeof clientOrderRef === 'string' && /^BP-[0-9A-Z-]{4,20}$/i.test(clientOrderRef))
      ? clientOrderRef
      : 'BP-' + deliveryDate.replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000);

    const { data: order, error: insertError } = await supabaseAdmin
      .from('b2e_orders')
      .insert({
        employee_id: employee.id,
        company_id: employee.company_id,
        office_id: effectiveOfficeId,
        order_ref: orderRef,
        order_items: items,
        order_total: orderTotal,
        contribution_rule_id: ruleId,
        employer_contribution: employerContribution,
        employee_amount: employeeAmount,
        payment_method: paymentMethod || 'cash',
        delivery_date: deliveryDate,
        pickup_code: pickupCode,
        status: 'confirmed',
      })
      .select()
      .single();
    if (insertError) throw insertError;

    await sendB2EConfirmation(order, employee, null);
    res.status(200).json({ order });
  } catch (err) {
    console.error('place-order error', err);
    res.status(500).json({ error: 'Erreur lors de la création de la commande.' });
  }
};
