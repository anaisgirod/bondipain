const { Resend } = require('resend');
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

function makeInviteCode(companyName) {
  const prefix = (companyName || 'BP').replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'BP';
  return `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
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

    const { email, fullName, phone, officeId, department } = req.body || {};
    if (!email) {
      res.status(400).json({ error: 'Email requis.' });
      return;
    }

    const redirectTo = `${process.env.SITE_URL || 'https://bondipain.vercel.app'}/b2e-login.html`;
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo },
    });
    if (linkError) throw linkError;

    const userId = linkData.user.id;
    const inviteCode = makeInviteCode(company.name);

    const { data: employee, error: employeeError } = await supabaseAdmin
      .from('employees')
      .insert({
        id: userId,
        company_id: company.id,
        office_id: officeId || company.default_office_id || null,
        full_name: fullName || null,
        work_email: email,
        phone: phone || null,
        invite_code: inviteCode,
        department: department || null,
        status: 'invited',
      })
      .select()
      .single();
    if (employeeError) throw employeeError;

    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'Bondipain <commandes@bondipain.com>',
      to: email,
      subject: `${company.name} vous offre un avantage repas Bondipain`,
      html: `
        <p>Bonjour${fullName ? ' ' + fullName : ''},</p>
        <p>${company.name} vous a inscrit à l'avantage repas Bondipain.</p>
        <p>Votre code d'invitation : <strong>${inviteCode}</strong></p>
        <p><a href="${linkData.properties.action_link}">Cliquez ici pour créer votre mot de passe et commander</a></p>
      `,
    });

    res.status(200).json({ employee });
  } catch (err) {
    console.error('invite-employee error', err);
    res.status(500).json({ error: "Erreur lors de l'invitation de l'employé." });
  }
};
