-- ============================================================
-- BONDIPAIN — Donner les droits admin à agirod@gramica.fr
-- Ajoute des règles RLS ADDITIVES (ne touche pas aux règles
-- existantes info@/hello@). À exécuter dans Supabase → SQL Editor.
-- Idempotent (relançable sans risque).
-- ============================================================

-- CONTENU DU SITE (corrige l'erreur "new row violates row-level security policy")
do $$ begin
  create policy "agirod gere site_content" on site_content for all
    using (auth.email() = 'agirod@gramica.fr')
    with check (auth.email() = 'agirod@gramica.fr');
exception when duplicate_object then null; when undefined_table then null; end $$;

-- PRODUITS (catalogue)
do $$ begin
  create policy "agirod gere products" on products for all
    using (auth.email() = 'agirod@gramica.fr')
    with check (auth.email() = 'agirod@gramica.fr');
exception when duplicate_object then null; when undefined_table then null; end $$;

-- MENU DU JOUR
do $$ begin
  create policy "agirod gere daily_menu" on daily_menu for all
    using (auth.email() = 'agirod@gramica.fr')
    with check (auth.email() = 'agirod@gramica.fr');
exception when duplicate_object then null; when undefined_table then null; end $$;

-- CONDIMENTS
do $$ begin
  create policy "agirod gere condiments" on condiments for all
    using (auth.email() = 'agirod@gramica.fr')
    with check (auth.email() = 'agirod@gramica.fr');
exception when duplicate_object then null; when undefined_table then null; end $$;

-- BOISSONS
do $$ begin
  create policy "agirod gere drinks" on drinks for all
    using (auth.email() = 'agirod@gramica.fr')
    with check (auth.email() = 'agirod@gramica.fr');
exception when duplicate_object then null; when undefined_table then null; end $$;

-- CATEGORIES DE MENU
do $$ begin
  create policy "agirod gere menu_categories" on menu_categories for all
    using (auth.email() = 'agirod@gramica.fr')
    with check (auth.email() = 'agirod@gramica.fr');
exception when duplicate_object then null; when undefined_table then null; end $$;

-- PHOTOS (storage.objects, bucket 'products') — upload/remplacement d'images
do $$ begin
  create policy "agirod gere storage products" on storage.objects for all
    using (bucket_id = 'products' and auth.email() = 'agirod@gramica.fr')
    with check (bucket_id = 'products' and auth.email() = 'agirod@gramica.fr');
exception when duplicate_object then null; when undefined_table then null; end $$;
