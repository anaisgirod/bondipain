const { getSupabaseAdmin, getEmployeeFromRequest } = require('./_supabaseAdmin');

const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

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

    const { items, deliveryDate, paymentMethod, officeId } = req.body || {};
    if (!Array.isArray(items) || items.length === 0 || !deliveryDate) {
      res.status(400).json({ error: 'Commande invalide.' });
      return;
    }

    const orderTotal = items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
    const effectiveOfficeId = officeId || employee.office_id;
    const dow = DOW[new Date(deliveryDate + 'T00:00:00Z').getUTCDay()];

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
    const orderRef = 'BP-' + deliveryDate.replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000);

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

    res.status(200).json({ order });
  } catch (err) {
    console.error('place-order error', err);
    res.status(500).json({ error: 'Erreur lors de la création de la commande.' });
  }
};
