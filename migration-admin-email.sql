-- ============================================================
-- BONDIPAIN — Bascule email admin : hello@ → info@bondipain.com
-- Met à jour les règles RLS pour accepter info@ (ET hello@ le temps
-- de la transition, pour éviter toute coupure d'accès admin).
-- À exécuter dans Supabase → SQL Editor. Idempotent & résilient
-- (les policies absentes sont ignorées).
-- ============================================================

-- PRODUITS
do $$ begin
  alter policy "Admin modifie les produits" on products
    using (auth.email() in ('info@bondipain.com','hello@bondipain.com'))
    with check (auth.email() in ('info@bondipain.com','hello@bondipain.com'));
exception when undefined_object then null; end $$;

do $$ begin
  alter policy "Admin ajoute des produits" on products
    with check (auth.email() in ('info@bondipain.com','hello@bondipain.com'));
exception when undefined_object then null; end $$;

do $$ begin
  alter policy "Admin supprime des produits" on products
    using (auth.email() in ('info@bondipain.com','hello@bondipain.com'));
exception when undefined_object then null; end $$;

-- PHOTOS PRODUITS (storage.objects, bucket 'products')
do $$ begin
  alter policy "Admin upload photos produits" on storage.objects
    with check (bucket_id = 'products' and auth.email() in ('info@bondipain.com','hello@bondipain.com'));
exception when undefined_object then null; end $$;

do $$ begin
  alter policy "Admin met à jour photos produits" on storage.objects
    using (bucket_id = 'products' and auth.email() in ('info@bondipain.com','hello@bondipain.com'))
    with check (bucket_id = 'products' and auth.email() in ('info@bondipain.com','hello@bondipain.com'));
exception when undefined_object then null; end $$;

do $$ begin
  alter policy "Admin supprime photos produits" on storage.objects
    using (bucket_id = 'products' and auth.email() in ('info@bondipain.com','hello@bondipain.com'));
exception when undefined_object then null; end $$;

-- MENU DU JOUR
do $$ begin
  alter policy "Admin gère le menu du jour" on daily_menu
    using (auth.email() in ('info@bondipain.com','hello@bondipain.com'))
    with check (auth.email() in ('info@bondipain.com','hello@bondipain.com'));
exception when undefined_object then null; end $$;

-- CONDIMENTS
do $$ begin
  alter policy "Admin gère les condiments" on condiments
    using (auth.email() in ('info@bondipain.com','hello@bondipain.com'))
    with check (auth.email() in ('info@bondipain.com','hello@bondipain.com'));
exception when undefined_object then null; end $$;

-- CONTENU DU SITE
do $$ begin
  alter policy "Admin modifie le contenu" on site_content
    using (auth.email() in ('info@bondipain.com','hello@bondipain.com'))
    with check (auth.email() in ('info@bondipain.com','hello@bondipain.com'));
exception when undefined_object then null; end $$;

-- CATÉGORIES DE MENU (si créées)
do $$ begin
  alter policy "Admin gère les catégories" on menu_categories
    using (auth.email() in ('info@bondipain.com','hello@bondipain.com'))
    with check (auth.email() in ('info@bondipain.com','hello@bondipain.com'));
exception when undefined_object then null; when undefined_table then null; end $$;
