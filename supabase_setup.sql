-- ============================================================
-- BONDIPAIN — Configuration Supabase B2B
-- À exécuter dans Supabase > SQL Editor
-- ============================================================

-- 1. TABLE ENTREPRISES
create table if not exists companies (
  id           uuid default gen_random_uuid() primary key,
  name         text not null,
  promo_code   text unique not null,
  subsidy_pct  integer default 50,
  contact_email text,
  active       boolean default true,
  created_at   timestamptz default now()
);

-- 2. TABLE COMMANDES B2B
create table if not exists b2b_orders (
  id               uuid default gen_random_uuid() primary key,
  company_id       uuid references companies(id),
  employee_name    text,
  employee_phone   text,
  order_ref        text,
  order_items      jsonb,
  order_total      integer,
  subsidy_amount   integer,
  employee_amount  integer,
  delivery_date    date,
  status           text default 'pending',
  created_at       timestamptz default now()
);

-- 3. RLS — ACTIVER
alter table companies    enable row level security;
alter table b2b_orders   enable row level security;

-- 4. RLS — VÉRIFICATION CODE PROMO (site B2C, clé anon)
-- Permet à n'importe qui (salarié) de lire les entreprises actives pour valider un code
create policy "Anon peut vérifier les codes actifs"
  on companies for select
  using (active = true);

-- 5. RLS — INSERTION COMMANDE B2B (site B2C, clé anon)
-- Permet au site d'enregistrer une commande B2B sans authentification
create policy "Anon peut créer des commandes B2B"
  on b2b_orders for insert
  with check (true);

-- 5b. TRIGGER — LIMITE 20 REPAS PAR JOUR PAR ENTREPRISE
-- Bloque l'insertion si une entreprise a déjà 20 commandes pour la même date
create or replace function check_daily_meal_limit()
returns trigger language plpgsql as $$
declare
  daily_count integer;
begin
  select count(*) into daily_count
  from b2b_orders
  where company_id    = NEW.company_id
    and delivery_date = NEW.delivery_date
    and status        != 'cancelled';

  if daily_count >= 20 then
    raise exception 'Limite de 20 repas par jour atteinte pour cette entreprise.'
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$$;

create trigger enforce_daily_meal_limit
  before insert on b2b_orders
  for each row execute function check_daily_meal_limit();

-- Pour appliquer ce trigger sur une base existante (si les tables existent déjà),
-- exécuter uniquement les deux blocs "create or replace function" et "create trigger" ci-dessus.

-- 6. RLS — LECTURE DASHBOARD (authentifié par email)
-- Un employeur connecté ne voit que les commandes de son entreprise
create policy "Employeur voit ses commandes"
  on b2b_orders for select
  using (
    company_id = (
      select id from companies
      where contact_email = auth.email()
      limit 1
    )
  );

create policy "Employeur voit sa fiche entreprise"
  on companies for select
  using (contact_email = auth.email());

-- ============================================================
-- EXEMPLE — Insérer une première entreprise cliente
-- Remplacer les valeurs par les vraies infos
-- ============================================================
insert into companies (name, promo_code, subsidy_pct, contact_email, active)
values
  ('Acme Corp', 'ACME2026', 50, 'rh@acme.re', true);

-- ============================================================
-- AUTHENTIFICATION DASHBOARD
-- Dans Supabase > Authentication > Users : créer un compte
-- avec l'email = contact_email de l'entreprise.
-- Le patron se connecte avec cet email sur dashboard.html
-- ============================================================

-- ============================================================
-- BONDIPAIN — Portail d'identification client B2C
-- Comptes particuliers créés depuis compte.html (Supabase Auth)
-- ============================================================

-- 7. TABLE CLIENTS PARTICULIERS (profil lié à auth.users)
create table if not exists customers (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  email      text,
  phone      text,
  created_at timestamptz default now()
);

alter table customers enable row level security;

create policy "Le client gère son propre profil"
  on customers for all
  using (id = auth.uid())
  with check (id = auth.uid());

-- 8. TABLE COMMANDES B2C (historique visible dans compte.html)
create table if not exists orders (
  id             uuid default gen_random_uuid() primary key,
  customer_id    uuid references customers(id) on delete cascade,
  order_ref      text,
  order_items    jsonb,
  order_total    integer,
  payment_method text,
  delivery_date  date,
  status         text default 'pending',
  created_at     timestamptz default now()
);

alter table orders enable row level security;

create policy "Le client voit ses propres commandes"
  on orders for select
  using (customer_id = auth.uid());

create policy "Le client crée ses propres commandes"
  on orders for insert
  with check (customer_id = auth.uid());

-- ============================================================
-- Un salarié qui commande avec un code B2B peut aussi être un
-- client identifié : la commande est alors dupliquée dans
-- b2b_orders (facturation entreprise) ET dans orders si connecté
-- (historique personnel), sans lien entre les deux tables.
-- ============================================================

-- ============================================================
-- BONDIPAIN — Panneau admin (modification des prix par Bondipain)
-- Compte admin : hello@bondipain.com (créer ce compte dans
-- Supabase > Authentication > Users s'il n'existe pas déjà)
-- ============================================================

-- 9. TABLE PRODUITS — prix modifiables depuis admin.html
create table if not exists products (
  id         text primary key,
  price      integer not null,
  active     boolean default true,
  updated_at timestamptz default now()
);

alter table products enable row level security;

-- Lecture publique (site + admin) : nécessaire pour que le site sache
-- quels articles sont désactivés, pas seulement ceux au prix à jour.
create policy "Lecture publique des produits"
  on products for select
  using (true);

-- Seul le compte admin Bondipain peut modifier les prix / disponibilité
create policy "Admin modifie les produits"
  on products for update
  using (auth.email() = 'hello@bondipain.com')
  with check (auth.email() = 'hello@bondipain.com');

create policy "Admin ajoute des produits"
  on products for insert
  with check (auth.email() = 'hello@bondipain.com');

create policy "Admin supprime des produits"
  on products for delete
  using (auth.email() = 'hello@bondipain.com');

-- 10. SEED — reprise des prix actuellement codés en dur dans index.html
insert into products (id, price) values
  ('v1', 130), ('v2', 130), ('v3', 130), ('v4', 130), ('v5', 130),
  ('v6', 130), ('v7', 130), ('v8', 130), ('v9', 130), ('v10', 130),
  ('v11', 130), ('v12', 130), ('v13', 130), ('v14', 130),
  ('nv1', 170), ('nv2', 170), ('nv3', 170), ('nv4', 170), ('nv5', 170),
  ('nv6', 185), ('nv7', 185), ('nv8', 185), ('nv9', 145),
  ('a1', 250),
  ('mj1', 220), ('mj2', 220),
  ('b1', 190), ('b2', 220),
  ('coca', 40), ('soda', 35), ('eau', 25), ('jus', 45)
on conflict (id) do nothing;

-- ============================================================
-- BONDIPAIN — Noms modifiables + photos produits (admin.html)
-- ============================================================

-- 11. COLONNES NOM (FR/EN) + PHOTO
alter table products add column if not exists name_fr text;
alter table products add column if not exists name_en text;
alter table products add column if not exists image_url text;
alter table products add column if not exists bestseller boolean default false;
-- Mode d'avantage employé par entreprise : 'contribution' (prix + part entreprise, défaut) ou 'free_daily' (1 repas offert/jour, extras au tarif normal)
alter table companies add column if not exists benefit_mode text default 'contribution';

-- 12. SEED DES NOMS ACTUELS (reprise des libellés codés en dur)
update products set name_fr = v.name_fr, name_en = v.name_en from (values
  ('v1',  'Chopsuey Teocon',        'Chopsuey Teocon'),
  ('v2',  'Saute Légumes',          'Sautéed Vegetables'),
  ('v3',  'Salade Gateau Piment',   'Chilli Cake Salad'),
  ('v4',  'Chatini Pomme de Terre', 'Potato Chatini'),
  ('v5',  'Saute Bringelle Poivron','Aubergine & Pepper'),
  ('v6',  'Achard Légumes',         'Vegetable Achard'),
  ('v7',  'Catless Veg',            'Veg Cutlet'),
  ('v8',  'Tandoorie Teocon',       'Tandoori Teocon'),
  ('v9',  'Vindaye Gateau Piment',  'Chilli Cake Vindaye'),
  ('v10', 'Vindaye Pomme de Terre', 'Potato Vindaye'),
  ('v11', 'Vindaye Teocon',         'Teocon Vindaye'),
  ('v12', 'Teocon Pané',            'Breaded Teocon'),
  ('v13', 'Salade Bringelle',       'Aubergine Salad'),
  ('v14', 'Vindaye Bringelle',      'Aubergine Vindaye'),
  ('nv1', 'Poulet Tandoorie',       'Tandoori Chicken'),
  ('nv2', 'Roti de Poulet',         'Chicken Roti'),
  ('nv3', 'Poulet Croustillant',    'Crispy Chicken'),
  ('nv4', 'Saute Poulet',           'Chicken Sauté'),
  ('nv5', 'Poulet Satay',           'Chicken Satay'),
  ('nv6', 'Poisson Pané',           'Breaded Fish'),
  ('nv7', 'Tikka Poisson',          'Fish Tikka'),
  ('nv8', 'Saute Poisson',          'Fish Sauté'),
  ('nv9', 'Pain Saucisse Poulet',   'Chicken Sausage Bread'),
  ('a1',  'Pain à l''Ancienne',     'Traditional Bread'),
  ('mj1', 'Mine Frite Poulet',      'Chicken Fried Noodles'),
  ('mj2', 'Riz Frite Poulet',       'Chicken Fried Rice'),
  ('b1',  'Briani Veg',             'Veg Biryani'),
  ('b2',  'Briani Poulet',          'Chicken Biryani'),
  ('coca','Coca-Cola',              'Coca-Cola'),
  ('soda','Soda',                   'Soda'),
  ('eau', 'Eau',                    'Water'),
  ('jus', 'Jus de fruit',           'Fruit juice')
) as v(id, name_fr, name_en)
where products.id = v.id;

-- 13. BUCKET DE STOCKAGE — photos produits (upload depuis admin.html)
insert into storage.buckets (id, name, public)
values ('products', 'products', true)
on conflict (id) do nothing;

create policy "Lecture publique photos produits"
  on storage.objects for select
  using (bucket_id = 'products');

create policy "Admin upload photos produits"
  on storage.objects for insert
  with check (bucket_id = 'products' and auth.email() = 'hello@bondipain.com');

create policy "Admin met à jour photos produits"
  on storage.objects for update
  using (bucket_id = 'products' and auth.email() = 'hello@bondipain.com')
  with check (bucket_id = 'products' and auth.email() = 'hello@bondipain.com');

create policy "Admin supprime photos produits"
  on storage.objects for delete
  using (bucket_id = 'products' and auth.email() = 'hello@bondipain.com');

-- ============================================================
-- AUTHENTIFICATION ADMIN
-- Dans Supabase > Authentication > Users : créer un compte avec
-- l'email hello@bondipain.com (mot de passe au choix de Bondipain).
-- Ce compte se connecte sur admin.html pour modifier les prix —
-- les changements sont visibles instantanément sur index.html.
-- ============================================================

-- ============================================================
-- BONDIPAIN — Plateforme B2E (avantage repas employé)
-- Étend companies/b2b_orders (conservées pour rétrocompatibilité
-- avec les entreprises encore sur l'ancien code promo partagé).
-- Les nouvelles tables ci-dessous portent le vrai compte employé,
-- le moteur de règles de contribution et le suivi de budget.
-- ============================================================

-- 14. COLONNES SUPPLÉMENTAIRES SUR COMPANIES
alter table companies add column if not exists domain text;
alter table companies add column if not exists billing_mode text default 'invoice';
alter table companies add column if not exists default_office_id uuid;

-- 15. BUREAUX / POINTS DE LIVRAISON PAR ENTREPRISE
create table if not exists company_offices (
  id            uuid default gen_random_uuid() primary key,
  company_id    uuid references companies(id) on delete cascade,
  name          text not null,
  address       text,
  delivery_slot text,
  active        boolean default true,
  created_at    timestamptz default now()
);

-- 16. ANNUAIRE EMPLOYÉS (compte complet Supabase Auth, comme customers)
create table if not exists employees (
  id              uuid primary key references auth.users(id) on delete cascade,
  company_id      uuid references companies(id) on delete cascade,
  office_id       uuid references company_offices(id),
  full_name       text,
  work_email      text unique,
  phone           text,
  invite_code     text unique,
  department      text,
  status          text default 'invited',
  dietary_prefs   jsonb default '[]',
  allergen_alerts jsonb default '[]',
  created_at      timestamptz default now()
);

-- 17. MOTEUR DE RÈGLES DE CONTRIBUTION
-- Priorité manuelle définie par le RH : en cas de règles multiples
-- éligibles pour une même commande, celle avec le "priority" le plus
-- élevé l'emporte (calcul fait côté serveur dans /api/place-order).
create table if not exists contribution_rules (
  id                 uuid default gen_random_uuid() primary key,
  company_id         uuid references companies(id) on delete cascade,
  name               text,
  mode               text not null, -- 'fixed' | 'percent'
  amount             numeric,
  percent            numeric,
  monthly_cap        numeric,
  daily_cap          numeric,
  eligible_days      jsonb default '["mon","tue","wed","thu","fri"]',
  eligible_products  jsonb,
  eligible_offices   jsonb,
  eligible_employees jsonb,
  priority           integer default 0,
  active             boolean default true,
  created_at         timestamptz default now()
);

-- 18. SUIVI DU BUDGET MENSUEL PAR EMPLOYÉ
create table if not exists employee_budget_ledger (
  id           uuid default gen_random_uuid() primary key,
  employee_id  uuid references employees(id) on delete cascade,
  period_month date not null,
  contributed  numeric default 0,
  updated_at   timestamptz default now(),
  unique(employee_id, period_month)
);

-- 19. COMMANDES B2E (parallèle à b2b_orders, mais par employé avec
-- capture de la règle appliquée au moment de la commande)
create table if not exists b2e_orders (
  id                     uuid default gen_random_uuid() primary key,
  employee_id            uuid references employees(id),
  company_id             uuid references companies(id),
  office_id              uuid references company_offices(id),
  order_ref              text,
  order_items            jsonb,
  order_total            numeric,
  contribution_rule_id   uuid references contribution_rules(id),
  employer_contribution  numeric,
  employee_amount        numeric,
  payment_method         text,
  delivery_date          date,
  pickup_code            text,
  status                 text default 'confirmed',
  rating                 integer,
  created_at             timestamptz default now()
);

-- 20. RLS — ACTIVER
alter table company_offices        enable row level security;
alter table employees              enable row level security;
alter table contribution_rules     enable row level security;
alter table employee_budget_ledger enable row level security;
alter table b2e_orders             enable row level security;

-- 21. RLS — EMPLOYÉ VOIT SON PROPRE PROFIL ET SES PROPRES COMMANDES
create policy "Employé voit son profil"
  on employees for select
  using (id = auth.uid());

create policy "Employé modifie son profil"
  on employees for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Employé voit ses commandes"
  on b2e_orders for select
  using (
    employee_id in (select id from employees where id = auth.uid())
  );

create policy "Employé voit son budget"
  on employee_budget_ledger for select
  using (
    employee_id in (select id from employees where id = auth.uid())
  );

-- L'employé peut aussi lire les bureaux et les règles de contribution de
-- SON entreprise (nécessaire pour afficher la bannière avantage et l'aperçu
-- "vous payez" côté client — le calcul qui fait foi reste côté serveur).
create policy "Employé lit les bureaux de son entreprise"
  on company_offices for select
  using (company_id = (select company_id from employees where id = auth.uid()));

create policy "Employé lit les règles de son entreprise"
  on contribution_rules for select
  using (company_id = (select company_id from employees where id = auth.uid()));

-- Aucune policy d'insertion anonyme/employé sur b2e_orders : les
-- commandes sont créées uniquement par /api/place-order.js avec la
-- clé service role (calcul de contribution non falsifiable).

-- 22. RLS — EMPLOYEUR (RH) GÈRE LES DONNÉES DE SA PROPRE ENTREPRISE
-- Même pattern que "Employeur voit ses commandes" plus haut (companies.contact_email)
create policy "Employeur gère ses bureaux"
  on company_offices for all
  using (company_id = (select id from companies where contact_email = auth.email()))
  with check (company_id = (select id from companies where contact_email = auth.email()));

create policy "Employeur gère ses employés"
  on employees for all
  using (company_id = (select id from companies where contact_email = auth.email()))
  with check (company_id = (select id from companies where contact_email = auth.email()));

create policy "Employeur gère ses règles de contribution"
  on contribution_rules for all
  using (company_id = (select id from companies where contact_email = auth.email()))
  with check (company_id = (select id from companies where contact_email = auth.email()));

create policy "Employeur voit ses commandes B2E"
  on b2e_orders for select
  using (company_id = (select id from companies where contact_email = auth.email()));

-- Le RH peut mettre à jour la fiche de SON entreprise (ex : mode de facturation)
create policy "Employeur met à jour sa fiche entreprise"
  on companies for update
  using (contact_email = auth.email())
  with check (contact_email = auth.email());

-- 23. RETRAIT DE L'ANCIEN PLAFOND GLOBAL (20 repas/jour/entreprise)
-- Remplacé par les plafonds mensuels/journaliers par employé définis
-- dans contribution_rules (monthly_cap / daily_cap), vérifiés dans
-- /api/place-order.js via employee_budget_ledger.
drop trigger if exists enforce_daily_meal_limit on b2b_orders;

-- ============================================================
-- AUTHENTIFICATION EMPLOYÉ
-- Un employé s'inscrit sur b2e-login.html (Supabase Auth, email
-- pro + mot de passe). Le code d'invitation ("invite_code") est
-- optionnel : il pré-remplit l'entreprise/le bureau à l'inscription
-- mais ne remplace pas le mot de passe.
-- ============================================================

-- ============================================================
-- PHASE 2 — Dashboard employé : favoris
-- ============================================================

-- 24. FAVORIS EMPLOYÉ (pour la recommande en 1 clic)
create table if not exists employee_favorites (
  id          uuid default gen_random_uuid() primary key,
  employee_id uuid references employees(id) on delete cascade,
  label       text,
  items       jsonb,   -- snapshot des lignes de panier à recommander
  created_at  timestamptz default now()
);

alter table employee_favorites enable row level security;

create policy "Employé gère ses favoris"
  on employee_favorites for all
  using (employee_id = auth.uid())
  with check (employee_id = auth.uid());

-- 25. L'employé peut noter ses propres commandes (colonne rating déjà présente)
create policy "Employé note ses commandes"
  on b2e_orders for update
  using (employee_id = auth.uid())
  with check (employee_id = auth.uid());

-- ============================================================
-- MENU DU JOUR — géré par Bondipain (change chaque semaine)
-- ============================================================

-- 26. TABLE MENU DU JOUR (5 jours × Veg/Non-Veg, PAR SEMAINE)
create table if not exists daily_menu (
  id          uuid default gen_random_uuid() primary key,
  week        text not null default '',  -- lundi de la semaine, 'AAAA-MM-JJ'
  day         text not null,        -- 'mon','tue','wed','thu','fri'
  type        text not null,        -- 'veg' | 'nonveg'
  name_fr     text,
  name_en     text,
  price       numeric default 220,
  ingredients text,
  allergens   text,
  image_url   text,
  available   boolean default true,
  updated_at  timestamptz default now(),
  unique(week, day, type)
);

-- ── MIGRATION (base déjà créée) : ajoute la semaine + rattache l'existant ──
-- À exécuter une fois dans Supabase si la table daily_menu existe déjà.
alter table daily_menu add column if not exists week text;
alter table daily_menu add column if not exists image_url text;
update daily_menu
  set week = to_char(date_trunc('week', (now() at time zone 'Indian/Mauritius')), 'YYYY-MM-DD')
  where week is null or week = '';
alter table daily_menu alter column week set not null;
alter table daily_menu drop constraint if exists daily_menu_day_type_key;
do $$ begin
  alter table daily_menu add constraint daily_menu_week_day_type_key unique (week, day, type);
exception
  when duplicate_object then null;   -- contrainte déjà présente
  when duplicate_table  then null;   -- index du même nom déjà présent (42P07)
end $$;

alter table daily_menu enable row level security;

create policy "Lecture publique menu du jour"
  on daily_menu for select using (true);

create policy "Admin gère le menu du jour"
  on daily_menu for all
  using (auth.email() = 'hello@bondipain.com')
  with check (auth.email() = 'hello@bondipain.com');

-- 27. SEED — le menu de la semaine EN COURS (prix par défaut Rs 220, à ajuster dans l'admin)
insert into daily_menu (week, day, type, name_fr, name_en, price)
select w.k, v.day, v.type, v.name_fr, v.name_en, v.price
from (select to_char(date_trunc('week', (now() at time zone 'Indian/Mauritius')), 'YYYY-MM-DD') as k) w,
(values
  ('mon','veg',    'Macaroni au Fromage',                       'Mac & Cheese',              220),
  ('mon','nonveg', 'Riz et poulet au miel',                     'Honey Chicken Rice',        220),
  ('tue','veg',    'Riz et Salade de Fromage',                  'Rice & Cheese Salad',       220),
  ('tue','nonveg', 'Nouilles sautées au poulet et gingembre',   'Ginger Chicken Noodles',    220),
  ('wed','veg',    'Purée de pomme de terre et légumes',        'Mashed Potato & Veggies',   220),
  ('wed','nonveg', 'Poisson grillé et légumes grillés',         'Grilled Fish & Veggies',    220),
  ('thu','veg',    'Riz cantonais aux légumes',                 'Veg Cantonese Rice',        220),
  ('thu','nonveg', 'Riz aux crevettes sauce rouge',             'Prawn Rice, Red Sauce',     220),
  ('fri','veg',    'Briani Légumes',                            'Veg Biryani',               190),
  ('fri','nonveg', 'Briani Poulet',                             'Chicken Biryani',           220)
) as v(day, type, name_fr, name_en, price)
on conflict (week, day, type) do nothing;

-- ============================================================
-- CONDIMENTS — gérés par Bondipain (Ketchup, Mayonnaise… éditables)
-- ============================================================

-- 28. TABLE CONDIMENTS
create table if not exists condiments (
  id         text primary key,
  name_fr    text,
  name_en    text,
  price      numeric default 0,
  available  boolean default true,
  sort       int default 0,
  updated_at timestamptz default now()
);

alter table condiments enable row level security;

create policy "Lecture publique condiments"
  on condiments for select using (true);

create policy "Admin gère les condiments"
  on condiments for all
  using (auth.email() = 'hello@bondipain.com')
  with check (auth.email() = 'hello@bondipain.com');

-- 29. SEED — condiments initiaux
insert into condiments (id, name_fr, name_en, price, sort) values
  ('ketchup', 'Ketchup',     'Ketchup',    0, 1),
  ('mayo',    'Mayonnaise',  'Mayonnaise', 0, 2)
on conflict (id) do nothing;

-- 30. NEWSLETTER — abonnés
create table if not exists newsletter_subscribers (
  id uuid default gen_random_uuid() primary key,
  email text unique not null,
  lang text default 'fr',
  source text default 'site',
  active boolean default true,
  created_at timestamptz default now()
);
alter table newsletter_subscribers enable row level security;
-- Inscription publique (insert only) ; lecture/gestion réservées au service role (admin via API)
create policy "Inscription newsletter publique"
  on newsletter_subscribers for insert with check (true);

-- 31. CONTENU ÉDITABLE DU SITE (mini-CMS) — textes des sections de la page d'accueil
create table if not exists site_content (
  key text primary key,
  fr  text,
  en  text,
  updated_at timestamptz default now()
);
alter table site_content enable row level security;
create policy "Lecture publique du contenu"
  on site_content for select using (true);
create policy "Admin modifie le contenu"
  on site_content for all
  using (auth.email() = 'hello@bondipain.com')
  with check (auth.email() = 'hello@bondipain.com');

alter table companies add column if not exists show_prices boolean default true;

-- 32. CATALOGUE DYNAMIQUE « Nos plats » — catégories + produits pilotés depuis l'admin
create table if not exists menu_categories (
  id      text primary key,
  name_fr text, name_en text,
  desc_fr text, desc_en text,
  tag_fr  text, tag_en  text,
  img     text,
  diet    text default 'mixed',   -- 'veg' | 'nonveg' | 'mixed'
  sort    integer default 0,
  active  boolean default true
);
alter table menu_categories enable row level security;
create policy "Lecture publique des catégories" on menu_categories for select using (true);
create policy "Admin gère les catégories" on menu_categories for all
  using (auth.email() = 'hello@bondipain.com') with check (auth.email() = 'hello@bondipain.com');

-- Produits enrichis (catégorie, description bilingue, tri)
alter table products add column if not exists category_id text;
alter table products add column if not exists desc_fr text;
alter table products add column if not exists desc_en text;
alter table products add column if not exists sort integer default 0;
