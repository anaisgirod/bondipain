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

// Notification à Bondipain (livreur) pour une commande entreprise — best-effort
async function sendB2EDriverNotification(supabaseAdmin, order, employee, companyName, contact = {}) {
  const notify = process.env.ORDERS_NOTIFY_EMAIL || 'info@bondipain.com';
  let office = null;
  if (order.office_id) {
    const { data } = await supabaseAdmin.from('company_offices').select('name, address, delivery_slot').eq('id', order.office_id).maybeSingle();
    office = data || null;
  }
  const deliveryPoint = office ? [office.name, office.address].filter(Boolean).join(' — ') : (contact.note || '');
  const phone = contact.phone || employee.phone || '';
  const inner = `
    <div style="background:#FDF1E5;border-radius:12px;padding:14px 16px;margin-bottom:18px;">
      <div style="font-size:13px;color:#837A70;">N° de commande</div>
      <div style="font-family:Georgia,serif;font-weight:bold;font-size:20px;color:#C9711B;">${order.order_ref}</div>
      <div style="font-size:13px;color:#837A70;margin-top:8px;">Code de retrait : <b>${order.pickup_code || '—'}</b></div>
    </div>
    <div style="background:#F7F3EC;border-radius:12px;padding:14px 16px;margin-bottom:16px;font-size:15px;color:#33302C;line-height:1.7;">
      <div style="font-weight:bold;margin-bottom:6px;">📍 Livraison entreprise</div>
      Employé : <b>${contact.name || employee.full_name || employee.work_email || ''}</b><br>
      ${companyName ? `Entreprise : <b>${companyName}</b><br>` : ''}
      ${phone ? `Téléphone : <b>${phone}</b><br>` : ''}
      ${deliveryPoint ? `Point de livraison : <b>${deliveryPoint}</b><br>` : ''}
      ${office && office.delivery_slot ? `Créneau : ${office.delivery_slot}<br>` : ''}
      Email : ${employee.work_email || ''}
    </div>
    ${itemsTable(order.order_items)}
    <p style="font-size:14px;color:#837A70;margin-top:14px;line-height:1.6;">Livraison le <b>${order.delivery_date}</b>, entre 11h et 14h.</p>`;
  try {
    await sendEmail({
      to: notify,
      subject: `🛵 Nouvelle commande entreprise ${order.order_ref}${(contact.name || employee.full_name) ? ' — ' + (contact.name || employee.full_name) : ''}`,
      html: wrap('Nouvelle commande entreprise', inner),
    });
  } catch (e) { console.warn('B2E driver notification failed:', e.message); }
}

function firstOfMonth(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function makePickupCode() {
  return 'BP-' + Math.floor(1000 + Math.random() * 9000);
}

// Date limite d'annulation : 15h00 (heure Maurice, UTC+4) le jour ouvrable précédant la livraison.
function cancelDeadlineMs(deliveryDateStr) {
  const s = String(deliveryDateStr || '').slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  if (!y) return 0;
  let dt = new Date(Date.UTC(y, m - 1, d));
  do { dt.setUTCDate(dt.getUTCDate() - 1); } while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6);
  return Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), 11, 0, 0); // 15h Maurice = 11h UTC
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

    // ── Annulation d'une commande employé (recrédite le budget mensuel) ──
    if (req.body && req.body.action === 'cancel') {
      const orderId = req.body.orderId;
      if (!orderId) { res.status(400).json({ error: 'Commande introuvable.' }); return; }
      const { data: ord, error: ordErr } = await supabaseAdmin
        .from('b2e_orders')
        .select('id, employee_id, delivery_date, status, employer_contribution, covered_meals')
        .eq('id', orderId).maybeSingle();
      if (ordErr) throw ordErr;
      if (!ord || ord.employee_id !== employee.id) { res.status(404).json({ error: 'Commande introuvable.' }); return; }
      if (ord.status === 'cancelled') { res.status(200).json({ ok: true, already: true }); return; }
      if (ord.status && ord.status !== 'confirmed') { res.status(409).json({ error: 'Cette commande ne peut plus être annulée.' }); return; }
      if (Date.now() >= cancelDeadlineMs(ord.delivery_date)) { res.status(409).json({ error: "Le délai d'annulation est dépassé." }); return; }

      const { error: upErr } = await supabaseAdmin.from('b2e_orders').update({ status: 'cancelled' }).eq('id', orderId);
      if (upErr) throw upErr;

      // Recréditer le budget mensuel consommé (Rs) ET le compteur de menus couverts.
      const contrib = Number(ord.employer_contribution || 0);
      const coveredMeals = Number(ord.covered_meals || 0);
      if (contrib > 0 || coveredMeals > 0) {
        const periodMonth = firstOfMonth(ord.delivery_date);
        const { data: ledger } = await supabaseAdmin
          .from('employee_budget_ledger').select('contributed, meals_covered')
          .eq('employee_id', employee.id).eq('period_month', periodMonth).maybeSingle();
        const already = Number(ledger?.contributed || 0);
        const alreadyMeals = Number(ledger?.meals_covered || 0);
        const next = Math.max(0, Math.round((already - contrib) * 100) / 100);
        const nextMeals = Math.max(0, alreadyMeals - coveredMeals);
        await supabaseAdmin.from('employee_budget_ledger').upsert(
          { employee_id: employee.id, period_month: periodMonth, contributed: next, meals_covered: nextMeals },
          { onConflict: 'employee_id,period_month' }
        );
      }
      res.status(200).json({ ok: true });
      return;
    }

    const { items, deliveryDate, paymentMethod, officeId, orderRef: clientOrderRef, contactPhone, contactName, deliveryNote } = req.body || {};
    const contact = { phone: contactPhone, name: contactName, note: deliveryNote };
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
      .select('benefit_mode, show_prices, billing_mode, name')
      .eq('id', employee.company_id)
      .maybeSingle();
    const benefitMode = company?.benefit_mode || 'contribution';

    // Prise en charge TOTALE (l'employé ne paie rien) si :
    //  - l'entreprise paie la totalité (billing_mode = 'full'), OU
    //  - les prix sont masqués ET ce n'est PAS le mode « 1 repas offert/jour »
    //    (en mode 1-offert/jour, les repas en plus restent au tarif normal, payés par l'employé)
    if (company && (company.billing_mode === 'full' || (company.show_prices === false && benefitMode !== 'free_daily'))) {
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
      await sendB2EConfirmation(order, employee, company?.name || null);
      await sendB2EDriverNotification(supabaseAdmin, order, employee, company?.name || null, contact);
      res.status(200).json({ order });
      return;
    }

    // MODE « repas offert » : l'entreprise prend en charge 1 MENU DE LA SEMAINE/jour (plat du jour « daily-… », prix unitaire le plus élevé).
    // Les plats du catalogue (hors menu de la semaine) restent au tarif normal, même seuls sur un jour.
    if (benefitMode === 'free_daily') {
      const isDaily = (it) => { const k = it && (it.pid || it.id); return typeof k === 'string' && k.startsWith('daily-'); };
      const unitPrices = items.filter(isDaily).map((it) => {
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
      await sendB2EConfirmation(order, employee, company?.name || null);
      await sendB2EDriverNotification(supabaseAdmin, order, employee, company?.name || null, contact);
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
    let coveredMeals = 0; // nombre de menus (plats) pris en charge par cette commande

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

      // Nombre de plats (menus) éligibles de cette commande, quantité comprise.
      const eligibleDishCount = items.reduce((n, item) => {
        const productEligible = !eligibleRule.eligible_products || eligibleRule.eligible_products.includes(item.id);
        return productEligible ? n + (Number(item.qty) || 1) : n;
      }, 0);

      const capRs = eligibleRule.monthly_cap;          // plafond mensuel en Rs (peut être null)
      const capMeals = eligibleRule.monthly_meal_cap;  // plafond mensuel en menus (peut être null)

      if (capRs != null || capMeals != null) {
        const periodMonth = firstOfMonth(deliveryDate);
        const { data: ledger } = await supabaseAdmin
          .from('employee_budget_ledger')
          .select('contributed, meals_covered')
          .eq('employee_id', employee.id)
          .eq('period_month', periodMonth)
          .maybeSingle();
        const alreadyRs = Number(ledger?.contributed || 0);
        const alreadyMeals = Number(ledger?.meals_covered || 0);

        // Plafond en Rs : borne le montant couvert.
        if (capRs != null) {
          employerContribution = Math.max(0, Math.min(employerContribution, capRs - alreadyRs));
        }
        // Plafond en menus : limite le NOMBRE de plats couverts ce mois-ci.
        if (capMeals != null) {
          const remainingMeals = Math.max(0, capMeals - alreadyMeals);
          if (remainingMeals <= 0) {
            employerContribution = 0; coveredMeals = 0;
          } else if (eligibleDishCount <= remainingMeals) {
            coveredMeals = eligibleDishCount;
          } else {
            // Couverture partielle : seuls les plats restants sont pris en charge (prorata).
            const frac = eligibleDishCount > 0 ? remainingMeals / eligibleDishCount : 0;
            employerContribution = employerContribution * frac;
            coveredMeals = remainingMeals;
          }
        } else {
          coveredMeals = employerContribution > 0 ? eligibleDishCount : 0;
        }

        employerContribution = Math.round(employerContribution * 100) / 100;
        await supabaseAdmin
          .from('employee_budget_ledger')
          .upsert(
            { employee_id: employee.id, period_month: periodMonth, contributed: alreadyRs + employerContribution, meals_covered: alreadyMeals + coveredMeals },
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
        covered_meals: coveredMeals,
        payment_method: paymentMethod || 'cash',
        delivery_date: deliveryDate,
        pickup_code: pickupCode,
        status: 'confirmed',
      })
      .select()
      .single();
    if (insertError) throw insertError;

    await sendB2EConfirmation(order, employee, company?.name || null);
    await sendB2EDriverNotification(supabaseAdmin, order, employee, company?.name || null, contact);
    res.status(200).json({ order });
  } catch (err) {
    console.error('place-order error', err);
    res.status(500).json({ error: 'Erreur lors de la création de la commande.' });
  }
};
