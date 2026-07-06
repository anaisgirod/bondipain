# Bondipain — Document de passation

Site de commande de pain garni (Moka, Maurice) avec deux parcours :
**B2C** (clients particuliers) et **B2E** (avantage repas offert par les entreprises à leurs employés).

## Stack & architecture

- **Front** : HTML/CSS/JS statique, **sans framework ni build** (tout est inline dans chaque `.html`).
- **Backend** : Supabase (Postgres + Auth + Storage) appelé côté client via la clé anon, et côté serveur via des **fonctions serverless Vercel** (`/api`) pour tout ce qui touche un secret ou un calcul non falsifiable.
- **Hébergement** : Vercel — projet `gramica/bondipain`, prod sur https://bondipain.vercel.app
- **i18n** : bilingue FR/EN via un dictionnaire `I18N` + attributs `data-i18n` (dans `index.html`).

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Site principal : accueil, menu B2C **et** menu employé B2E (état `b2eSession`), panier, checkout, fiches plats |
| `b2e-login.html` | Connexion employé (Supabase Auth, email pro + mot de passe) |
| `employeur.html` | Portail RH : bureaux, employés (invit./retrait), règles de contribution, mode de facturation, export CSV |
| `compte.html` | Comptes clients B2C + point d'entrée login entreprise |
| `dashboard.html` | Ancien tableau de bord employeur (commandes B2B, historique) |
| `admin.html` | Admin Bondipain : édition prix/noms/photos des produits (compte `hello@bondipain.com`) |
| `api/place-order.js` | **Autorité** : calcule la contribution employeur + montant employé, vérifie les plafonds, insère `b2e_orders`, met à jour le budget, génère le code de retrait. Utilise la clé **service role**. |
| `api/send-email.js` | Envoi d'emails via Resend |
| `api/invite-employee.js` | Crée l'employé + envoie l'email d'invitation |
| `api/export-invoice.js` | Export CSV des commandes B2E d'une entreprise |
| `api/_supabaseAdmin.js` | Helper : client Supabase service role + lecture de l'employé depuis le token |
| `supabase_setup.sql` | Schéma complet + policies RLS (à exécuter dans Supabase SQL Editor) |

## Variables d'environnement (Vercel → Settings → Environment Variables)

| Nom | Rôle | Secret ? |
|---|---|---|
| `SUPABASE_URL` | URL du projet Supabase | non |
| `SUPABASE_KEY` | Clé anon/publishable (aussi codée en dur côté client, c'est normal) | non |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé admin Supabase — **uniquement côté serveur** | **OUI** |
| `RESEND_API_KEY` | Clé Resend pour les emails | **OUI** |
| `SITE_URL` | `https://bondipain.vercel.app` (liens dans les emails) | non |

Les mêmes valeurs (sauf secrets) sont dans un fichier `.env` local **non versionné** (dans `.gitignore`). Les clés secrètes sont à récupérer auprès d'Anaïs / dans le dashboard Vercel.

## Base de données (Supabase)

Tables B2C historiques : `companies`, `b2b_orders`, `customers`, `orders`, `products`.
Tables B2E (nouvelles) : `company_offices`, `employees`, `contribution_rules`, `employee_budget_ledger`, `b2e_orders`.
Tout le schéma + les policies RLS sont dans `supabase_setup.sql`. Les insertions dans `b2e_orders` se font **uniquement** via `/api/place-order` (clé service role) — pas de policy d'insert anonyme.

**Moteur de règles de contribution** : `mode` fixe (Rs) ou pourcentage, plafonds journalier/mensuel, jours/produits/bureaux/employés éligibles, `priority` (la règle éligible la plus prioritaire gagne).

## Lancer en local

```bash
npm install            # installe @supabase/supabase-js et resend (pour /api)
vercel dev             # sert le site + les fonctions /api sur http://localhost:3000
```
(Nécessite le Vercel CLI : `npm i -g vercel`, puis `vercel login` et le projet lié.)

## Déployer

```bash
vercel            # déploiement preview (URL de test, protégée par SSO Vercel)
vercel --prod     # déploiement production (bondipain.vercel.app)
```

## Comptes de test (données de démo dans la base)

- **Employé** : `jason@acme.re` / `TestEmp2026!` (entreprise Acme Corp, bureau Moka, règle Rs 150/repas, plafond Rs 3000/mois)
- **RH / employeur** : `rh@acme.re` / `TestRH2026!`
- **Admin Bondipain** : `hello@bondipain.com` (mot de passe détenu par Bondipain)

> Ces comptes/entreprise/commandes sont des **données de test** — à supprimer avant la mise en production réelle.

## Points en attente / TODO

- **Photos des plats** : actuellement génériques (choisies par type dans `DISH_PHOTOS` de `index.html`). Dès qu'une photo par plat est chargée via l'admin (`products.image_url`), elle remplace automatiquement la générique.
- **Filtres régime avancés** (vegan / halal / allergènes) : nécessitent de **taguer chaque plat** (données absentes). Seul le filtre Végé/Non-végé (déduit des catégories) est actif.
- **Emails Resend** : branchés dans les fonctions `/api` mais non testés en prod (dépend de la validité de `RESEND_API_KEY`).
- **Phases suivantes du cahier des charges client** (non faites) : dashboard employé (favoris, historique, préférences), formules avec remplacement, suivi de commande en temps réel + note, reporting RH complet, opérations cuisine (étiquettes, tournées).

## Contexte produit

Le cahier des charges complet du client (14 écrans) décrit une plateforme B2E complète. **La Phase 1 « B2E essentiel » (priorité n°1 du client) est livrée**, plus plusieurs améliorations d'écran. Les phases 2 à 4 restent à faire (voir TODO).
