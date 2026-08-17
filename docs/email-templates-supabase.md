# Templates d'emails Supabase (Auth) — Bondipain

Ces emails (mot de passe oublié, confirmation de compte, invitation) sont gérés par
**Supabase**, pas par le code du site.

## Où les modifier
Dashboard Supabase → **Authentication** → **Emails** → **Templates**.
Choisissez le template (Reset Password, Confirm signup…), remplacez le **Subject** et le
**Message body (HTML)** par le code ci-dessous, puis **Save**.

⚠️ Ne supprimez jamais `{{ .ConfirmationURL }}` — c'est le lien d'action de l'email.

---

> **Site bilingue FR/EN :** un template Supabase est unique (pas de bascule auto par langue).
> La solution simple = **email bilingue** : on affiche le texte FR puis EN dans le même email,
> avec un bouton libellé dans les deux langues. Les versions ci-dessous sont déjà bilingues.

## 1) Reset Password (« Mot de passe oublié »)

**Subject :**
```
Reset your password · Réinitialisez votre mot de passe — Bondipain
```

**Message body (HTML) :**
```html
<div style="margin:0;background:#F7F5F0;font-family:Arial,Helvetica,sans-serif;color:#2A2622;padding:24px 18px;">
  <div style="max-width:560px;margin:0 auto;">
    <div style="background:#FF8C00;border-radius:16px 16px 0 0;padding:22px 26px;text-align:center;">
      <span style="font-family:Georgia,serif;font-weight:bold;font-size:28px;color:#fff;letter-spacing:.5px;">Bondipain</span>
      <div style="height:4px;width:52px;background:#FEC12C;border-radius:999px;margin:10px auto 0;"></div>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:30px 28px;">
      <h1 style="font-size:22px;margin:0 0 16px;color:#DA4928;">Reset your password</h1>
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Hello,</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">You requested to reset the password for your Bondipain account. Click the button below to choose a new one.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr><td style="border-radius:999px;background:#FF8C00;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 30px;font-weight:bold;font-size:15px;color:#fff;text-decoration:none;border-radius:999px;">New password · Nouveau mot de passe</a>
      </td></tr></table>
      <p style="font-size:13px;color:#837A70;line-height:1.6;margin:0;">This link expires in 1 hour. If you didn't request this, simply ignore this email.</p>
      <hr style="border:none;border-top:1px solid #EFE3D5;margin:22px 0;">
      <h2 style="font-size:18px;margin:0 0 12px;color:#DA4928;">Réinitialisez votre mot de passe</h2>
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Bonjour,</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Vous avez demandé à réinitialiser le mot de passe de votre compte Bondipain. Utilisez le bouton ci-dessus pour en choisir un nouveau.</p>
      <p style="font-size:13px;color:#837A70;line-height:1.6;margin:0;">Ce lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
    </div>
    <p style="text-align:center;color:#837A70;font-size:12px;margin:22px 0 0;line-height:1.6;">Bondipain · Pain garni fait maison · Livraison à Moka<br>
      <a href="https://www.bondipain.com" style="color:#DA4928;text-decoration:none;font-weight:bold;">www.bondipain.com</a></p>
  </div>
</div>
```

---

## 2) Confirm signup (« Nouveau compte »)

**Subject :**
```
Confirm your account · Confirmez votre compte — Bondipain
```

**Message body (HTML) :**
```html
<div style="margin:0;background:#F7F5F0;font-family:Arial,Helvetica,sans-serif;color:#2A2622;padding:24px 18px;">
  <div style="max-width:560px;margin:0 auto;">
    <div style="background:#FF8C00;border-radius:16px 16px 0 0;padding:22px 26px;text-align:center;">
      <span style="font-family:Georgia,serif;font-weight:bold;font-size:28px;color:#fff;letter-spacing:.5px;">Bondipain</span>
      <div style="height:4px;width:52px;background:#FEC12C;border-radius:999px;margin:10px auto 0;"></div>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:30px 28px;">
      <h1 style="font-size:22px;margin:0 0 16px;color:#DA4928;">Welcome to Bondipain 🥖</h1>
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Thanks for creating your account! Confirm your email address to activate it and start ordering our homemade stuffed breads, delivered fresh in Moka.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr><td style="border-radius:999px;background:#FF8C00;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 30px;font-weight:bold;font-size:15px;color:#fff;text-decoration:none;border-radius:999px;">Confirm my account · Confirmer mon compte</a>
      </td></tr></table>
      <hr style="border:none;border-top:1px solid #EFE3D5;margin:22px 0;">
      <h2 style="font-size:18px;margin:0 0 12px;color:#DA4928;">Bienvenue chez Bondipain 🥖</h2>
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Merci d'avoir créé votre compte ! Confirmez votre adresse email pour l'activer et commencer à commander vos pains garnis, livrés frais à Moka.</p>
      <p style="font-size:13px;color:#837A70;line-height:1.6;margin:0;">If you didn't create a Bondipain account, ignore this email. · Si vous n'avez pas créé de compte Bondipain, ignorez cet email.</p>
    </div>
    <p style="text-align:center;color:#837A70;font-size:12px;margin:22px 0 0;line-height:1.6;">Bondipain · Pain garni fait maison · Livraison à Moka<br>
      <a href="https://www.bondipain.com" style="color:#DA4928;text-decoration:none;font-weight:bold;">www.bondipain.com</a></p>
  </div>
</div>
```

---

## 3) Change Email Address (« Confirm your email address »)

Envoyé quand une personne change son adresse email (confirme la nouvelle adresse).

**Subject :**
```
Confirm your email address · Confirmez votre adresse email — Bondipain
```

**Message body (HTML) :**
```html
<div style="margin:0;background:#F7F5F0;font-family:Arial,Helvetica,sans-serif;color:#2A2622;padding:24px 18px;">
  <div style="max-width:560px;margin:0 auto;">
    <div style="background:#FF8C00;border-radius:16px 16px 0 0;padding:22px 26px;text-align:center;">
      <span style="font-family:Georgia,serif;font-weight:bold;font-size:28px;color:#fff;letter-spacing:.5px;">Bondipain</span>
      <div style="height:4px;width:52px;background:#FEC12C;border-radius:999px;margin:10px auto 0;"></div>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:30px 28px;">
      <h1 style="font-size:22px;margin:0 0 16px;color:#DA4928;">Confirm your email address</h1>
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Hello,</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">You requested to change the email address of your Bondipain account. Click the button below to confirm this new address.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr><td style="border-radius:999px;background:#FF8C00;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 30px;font-weight:bold;font-size:15px;color:#fff;text-decoration:none;border-radius:999px;">Confirm my email · Confirmer mon email</a>
      </td></tr></table>
      <p style="font-size:13px;color:#837A70;line-height:1.6;margin:0;">If you didn't request this change, simply ignore this email.</p>
      <hr style="border:none;border-top:1px solid #EFE3D5;margin:22px 0;">
      <h2 style="font-size:18px;margin:0 0 12px;color:#DA4928;">Confirmez votre adresse email</h2>
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Bonjour,</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Vous avez demandé à changer l'adresse email de votre compte Bondipain. Utilisez le bouton ci-dessus pour confirmer cette nouvelle adresse.</p>
      <p style="font-size:13px;color:#837A70;line-height:1.6;margin:0;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.</p>
    </div>
    <p style="text-align:center;color:#837A70;font-size:12px;margin:22px 0 0;line-height:1.6;">Bondipain · Pain garni fait maison · Livraison à Moka<br>
      <a href="https://www.bondipain.com" style="color:#DA4928;text-decoration:none;font-weight:bold;">www.bondipain.com</a></p>
  </div>
</div>
```

---

## 4) Invite user (« Invitation »)

Envoyé quand vous invitez quelqu'un (ex. un employé) à créer son compte.

**Subject :**
```
You're invited to Bondipain · Vous êtes invité·e sur Bondipain
```

**Message body (HTML) :**
```html
<div style="margin:0;background:#F7F5F0;font-family:Arial,Helvetica,sans-serif;color:#2A2622;padding:24px 18px;">
  <div style="max-width:560px;margin:0 auto;">
    <div style="background:#FF8C00;border-radius:16px 16px 0 0;padding:22px 26px;text-align:center;">
      <span style="font-family:Georgia,serif;font-weight:bold;font-size:28px;color:#fff;letter-spacing:.5px;">Bondipain</span>
      <div style="height:4px;width:52px;background:#FEC12C;border-radius:999px;margin:10px auto 0;"></div>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:30px 28px;">
      <h1 style="font-size:22px;margin:0 0 16px;color:#DA4928;">You're invited 🎉</h1>
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Hello,</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">You've been invited to join Bondipain. Click the button below to set up your account and get started.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr><td style="border-radius:999px;background:#FF8C00;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 30px;font-weight:bold;font-size:15px;color:#fff;text-decoration:none;border-radius:999px;">Accept invitation · Accepter l'invitation</a>
      </td></tr></table>
      <hr style="border:none;border-top:1px solid #EFE3D5;margin:22px 0;">
      <h2 style="font-size:18px;margin:0 0 12px;color:#DA4928;">Vous êtes invité·e 🎉</h2>
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Bonjour,</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Vous avez été invité·e à rejoindre Bondipain. Cliquez sur le bouton ci-dessus pour créer votre compte et commencer.</p>
    </div>
    <p style="text-align:center;color:#837A70;font-size:12px;margin:22px 0 0;line-height:1.6;">Bondipain · Pain garni fait maison · Livraison à Moka<br>
      <a href="https://www.bondipain.com" style="color:#DA4928;text-decoration:none;font-weight:bold;">www.bondipain.com</a></p>
  </div>
</div>
```

---

## 5) Magic Link (« Lien de connexion »)

Envoyé pour se connecter sans mot de passe, via un lien à usage unique.

**Subject :**
```
Your Bondipain sign-in link · Votre lien de connexion Bondipain
```

**Message body (HTML) :**
```html
<div style="margin:0;background:#F7F5F0;font-family:Arial,Helvetica,sans-serif;color:#2A2622;padding:24px 18px;">
  <div style="max-width:560px;margin:0 auto;">
    <div style="background:#FF8C00;border-radius:16px 16px 0 0;padding:22px 26px;text-align:center;">
      <span style="font-family:Georgia,serif;font-weight:bold;font-size:28px;color:#fff;letter-spacing:.5px;">Bondipain</span>
      <div style="height:4px;width:52px;background:#FEC12C;border-radius:999px;margin:10px auto 0;"></div>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:30px 28px;">
      <h1 style="font-size:22px;margin:0 0 16px;color:#DA4928;">Sign in to Bondipain</h1>
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Hello,</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Click the button below to sign in to your Bondipain account. No password needed.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr><td style="border-radius:999px;background:#FF8C00;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 30px;font-weight:bold;font-size:15px;color:#fff;text-decoration:none;border-radius:999px;">Sign in · Se connecter</a>
      </td></tr></table>
      <p style="font-size:13px;color:#837A70;line-height:1.6;margin:0;">This link expires soon and can be used once. If you didn't request it, ignore this email.</p>
      <hr style="border:none;border-top:1px solid #EFE3D5;margin:22px 0;">
      <h2 style="font-size:18px;margin:0 0 12px;color:#DA4928;">Connectez-vous à Bondipain</h2>
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Bonjour,</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Cliquez sur le bouton ci-dessus pour vous connecter à votre compte Bondipain. Aucun mot de passe requis.</p>
      <p style="font-size:13px;color:#837A70;line-height:1.6;margin:0;">Ce lien expire rapidement et est à usage unique. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
    </div>
    <p style="text-align:center;color:#837A70;font-size:12px;margin:22px 0 0;line-height:1.6;">Bondipain · Pain garni fait maison · Livraison à Moka<br>
      <a href="https://www.bondipain.com" style="color:#DA4928;text-decoration:none;font-weight:bold;">www.bondipain.com</a></p>
  </div>
</div>
```

---

## Variables Supabase utiles
- `{{ .ConfirmationURL }}` — lien d'action (à garder absolument)
- `{{ .Email }}` — email du destinataire
- `{{ .SiteURL }}` — l'URL du site configurée
- `{{ .Token }}` — code à 6 chiffres (si vous préférez un code au lien)

Les autres templates (Invite user, Magic Link, Change Email) peuvent reprendre exactement
la même structure : gardez l'en-tête/pied, changez le titre + le texte + le libellé du bouton.
