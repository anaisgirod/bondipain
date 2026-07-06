const { Resend } = require('resend');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { to, subject, html } = req.body || {};
  if (!to || !subject || !html) {
    res.status(400).json({ error: 'Champs to/subject/html requis.' });
    return;
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'Bondipain <commandes@bondipain.com>',
      to,
      subject,
      html,
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('send-email error', err);
    res.status(500).json({ error: "Erreur lors de l'envoi de l'email." });
  }
};
