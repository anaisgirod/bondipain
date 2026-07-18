-- ============================================================
-- BONDIPAIN — Table BOISSONS (gérées dans l'admin, comme les condiments)
-- À exécuter dans Supabase → SQL Editor. Idempotent.
-- ============================================================

create table if not exists drinks (
  id         text primary key,
  name_fr    text,
  name_en    text,
  price      numeric default 0,
  available  boolean default true,
  sort       int default 0,
  updated_at timestamptz default now()
);

alter table drinks enable row level security;

do $$ begin
  create policy "Lecture publique boissons"
    on drinks for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Admin gère les boissons"
    on drinks for all
    using (auth.email() in ('info@bondipain.com','hello@bondipain.com'))
    with check (auth.email() in ('info@bondipain.com','hello@bondipain.com'));
exception when duplicate_object then null; end $$;

-- Boissons initiales (reprise des valeurs par défaut du site)
insert into drinks (id, name_fr, name_en, price, sort) values
  ('coca', 'Coca-Cola',    'Coca-Cola',    40, 1),
  ('soda', 'Soda',         'Soda',         35, 2),
  ('eau',  'Eau',          'Water',        25, 3),
  ('jus',  'Jus de fruit', 'Fruit juice',  45, 4)
on conflict (id) do nothing;
