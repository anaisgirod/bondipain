-- Regroupement des boissons (ex. « Soft drinks », « Fuze Tea », « Eau »).
-- Le libellé de groupe est optionnel : les boissons sans groupe restent affichées normalement.
-- À exécuter dans Supabase → SQL Editor.

alter table public.drinks add column if not exists group_label text;
