# Bondipain — Document de passation

Plateforme de commande de repas (Moka, Maurice) avec **3 parcours** sur un seul site :
- **B2C** : clients particuliers, prix plein, paiement invité.
- **B2E** : employés d'entreprises partenaires, connexion + contribution employeur automatique sur le déjeuner.
- **B2B** : portail employeur (RH) pour gérer employés, règles de contribution, budget, facturation, reporting.

Prod : **https://bondipain.vercel.app** · Projet Vercel : `gramica/bondipain` · Tout est en roupies (Rs).

## Stack & architecture
- **Front** : HTML/CSS/JS statique, **sans framework ni build** (tout inline dans chaque `.html`).
- **Backend** : Supabase (Postgres + Auth + Storage), appelé côté client (clé anon) pour la lecture, et via **fonctions serverless Vercel** (`/api`) pour tout ce qui touche un secret ou un calcul non falsifiable.
- **i18n** : bilingue FR/EN (dictionnaire `I18N` + attributs `data-i18n` dans `index.html`).
- **Fuseau** : le cutoff de commande est calculé en **heure de Maurice (UTC+4)** via `mtNow()` dans `index.html`.

## Pages
| Fichier | Rôle |
|---|---|
| `index.html` | Site principal : accueil (2 CTA B2C/B2E), catalogue « Nos plats » (pains), encart **Menu** → modal Menu du jour (Lun→Ven), panier, checkout B2C **et** B2E, formules, fiches plats |
| `b2e-login.html` | Connexion employé (Supabase Auth) |
| `mon-espace-b2e.html` | Dashboard employé : budget, favoris, historique + suivi de commande + notation, préférences alimentaires |
| `employeur.html` | Portail RH (B2B) : **Rapport** (stats + facture PDF), Bureaux, Employés (invit./retrait), Règles de contribution, Facturation (CSV) |
| `entreprises.html` | Page d'atterrissage commerciale B2B (« Un avantage déjeuner simple pour vos employés ») |
| `admin.html` | Admin Bondipain (`info@bondipain.com`) : **Menu du jour** (édition hebdo : nom, prix, ingrédients, allergènes, dispo) + catalogue pains (prix/noms/photos) |
| `cuisine.html` | Opérations cuisine (admin) : commandes groupées par bureau/créneau, lots, étiquettes imprimables, plan de tournée |
| `compte.html` | Comptes clients B2C + entrée login entreprise |
| `dashboard.html` | Ancien tableau de bord employeur (commandes B2B historiques) |

## Fonctions serverless (`/api`)
| Fichier | Rôle | Clé |
|---|---|---|
| `place-order.js` | **Autorité** : calcule la contribution employeur + montant employé, vérifie les plafonds, insère `b2e_orders`, met à jour le budget, génère le code de retrait | service role |
| `send-email.js` | Emails via Resend | RESEND |
| `invite-employee.js` | Crée l'employé + email d'invitation | service role + RESEND |
| `export-invoice.js` | Export CSV des commandes B2E d'une entreprise | service role |
| `kitchen-batch.js` | Données cuisine groupées (jour) pour `cuisine.html` | service role |
| `_supabaseAdmin.js` | Helper client service role + lecture employé depuis le token | — |

## Variables d'environnement (Vercel → Settings → Environment Variables)
| Nom | Rôle | Secret |
|---|---|---|
| `SUPABASE_URL` | URL projet Supabase | non |
| `SUPABASE_KEY` | Clé anon (aussi en dur côté client, normal) | non |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé admin — **serveur uniquement** | **OUI** |
| `RESEND_API_KEY` | Clé Resend (emails) | **OUI** |
| `SITE_URL` | `https://bondipain.vercel.app` | non |

`.env` local (non versionné) contient les mêmes valeurs. Secrets à récupérer auprès d'Anaïs / dans Vercel.

## Base de données (Supabase) — voir `supabase_setup.sql`
- **B2C historique** : `companies`, `b2b_orders`, `customers`, `orders`, `products` (+ bucket photos).
- **B2E** : `company_offices`, `employees`, `contribution_rules`, `employee_budget_ledger`, `b2e_orders`.
- **Phase 2** : `employee_favorites` (+ policy note sur `b2e_orders`).
- **Menu du jour** : `daily_menu` (5 jours × Veg/Non-Veg — nom, prix, ingrédients, allergènes, disponibilité), géré par l'admin, lu par le site.
- Les insertions dans `b2e_orders` se font **uniquement** via `/api/place-order` (service role). Le reste suit les policies RLS (voir le fichier).

`supabase_setup.sql` est le schéma complet, à jour, à exécuter dans Supabase SQL Editor. Il est idempotent (`if not exists`, `on conflict do nothing`).

## Règles métier clés
- **Cutoff 15h heure Maurice** : pour être livré un jour J, commander avant 15h la veille. Après 15h → J indisponible, premier créneau = surlendemain (48h). Jours non commandables **grisés**.
- **Menu du jour** : un plat Veg + un Non-Veg par jour (Lun→Ven), Vendredi = Briani. Chaque plat n'est **commandable que son jour** (ex : le plat du lundi = livraison un lundi).
- **Contribution B2E** : moteur de règles (fixe/%, plafonds jour/mois, jours/produits/bureaux/employés éligibles, priorité). Calcul **serveur** au paiement — le « vous payez » côté client n'est qu'un aperçu.

## Lancer / déployer
```bash
npm install          # @supabase/supabase-js + resend (pour /api)
vercel dev           # site + /api en local sur http://localhost:3000
vercel --prod        # déploiement production
```
(Vercel CLI : `npm i -g vercel`, `vercel login`, projet déjà lié.)

## Comptes de test (données de démo — à supprimer avant prod réelle)
- **Employé** : `jason@acme.re` / `TestEmp2026!` (Acme Corp, bureau Moka, règle Rs 150/repas, plafond Rs 3000/mois)
- **RH / employeur** : `rh@acme.re` / `TestRH2026!`
- **Admin Bondipain** : `info@bondipain.com` (mot de passe détenu par Bondipain)

## Assets logo
`logo-full.png` (lockup orange, en-tête), `logo-full-white.png` (footer sombre), `logo-icon.png` (favicon). Source : dossier `Logo_Bondipain 3/`.

## État — fait
- ✅ B2C complet (menu, panier, checkout invité, promo)
- ✅ B2E : login employé, détection entreprise, contribution au checkout, code de retrait, suivi
- ✅ Dashboard employé (budget, favoris, historique, notes, préférences)
- ✅ Formules (plat + boisson, remplacement)
- ✅ Portail RH : bureaux, employés, règles, **reporting + facture PDF**, export CSV
- ✅ Page Entreprises (vente B2B)
- ✅ Opérations cuisine (lots, étiquettes, tournée)
- ✅ Menu du jour piloté par la base + **admin d'édition hebdomadaire**
- ✅ Cutoff 15h heure Maurice + grisage
- ✅ Nouvelle identité (logo)

## TODO / à finir
- **Prix réels du menu du jour** : Rs 220 par défaut, à ajuster dans l'admin.
- **Emails Resend** : fonctions prêtes, non testées en prod (dépend de la validité de `RESEND_API_KEY`).
- **Paiement en ligne réel** : aujourd'hui espèces / Juice MCB ; la carte bancaire est un placeholder (pas de prestataire de paiement intégré).
- **Supprimer les données de test** avant ouverture réelle.
- **Notifications, tracking livraison temps réel, planification de tournée avancée** : non faits (ops manuelles au début).
