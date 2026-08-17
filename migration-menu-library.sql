-- ============================================================
-- BONDIPAIN — Bibliothèque de menus du jour (réutilisables)
-- Une réserve de plats (veg / non-veg) saisis UNE fois, puis
-- piochés dans l'éditeur hebdomadaire (copie dans daily_menu).
-- À exécuter UNE FOIS dans Supabase → SQL Editor. Idempotent.
-- ============================================================

create table if not exists menu_library (
  id           uuid primary key default gen_random_uuid(),
  type         text not null default 'veg',           -- 'veg' | 'nonveg'
  name_fr      text not null default '',
  name_en      text not null default '',
  ingredients  text default '',                        -- description FR
  allergens    text default '',                        -- description EN
  price        integer default 220,
  image_url    text,
  active        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table menu_library enable row level security;

-- Accès réservé aux administrateurs Bondipain (même schéma que daily_menu).
do $$ begin
  create policy "info gere menu_library" on menu_library for all
    using (auth.email() = 'info@bondipain.com') with check (auth.email() = 'info@bondipain.com');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "hello gere menu_library" on menu_library for all
    using (auth.email() = 'hello@bondipain.com') with check (auth.email() = 'hello@bondipain.com');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "agirod gere menu_library" on menu_library for all
    using (auth.email() = 'agirod@gramica.fr') with check (auth.email() = 'agirod@gramica.fr');
exception when duplicate_object then null; end $$;
