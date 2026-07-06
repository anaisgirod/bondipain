const { createClient } = require('@supabase/supabase-js');

function getSupabaseAdmin() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function getEmployeeFromRequest(req, supabaseAdmin) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) return null;

  const { data: employee, error: employeeError } = await supabaseAdmin
    .from('employees')
    .select('*')
    .eq('id', userData.user.id)
    .single();
  if (employeeError || !employee) return null;

  return employee;
}

module.exports = { getSupabaseAdmin, getEmployeeFromRequest };
