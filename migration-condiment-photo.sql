-- ============================================================
-- BONDIPAIN — Photo pour les condiments
-- Ajoute la colonne image_url à la table condiments.
-- À exécuter dans Supabase → SQL Editor. Idempotent.
-- ============================================================

alter table condiments add column if not exists image_url text;
