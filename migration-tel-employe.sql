-- ============================================================
-- MIGRATION — Téléphone de l'employé (géré par le RH)
-- À exécuter UNE FOIS dans Supabase (SQL Editor). Idempotent.
-- ============================================================

alter table employees add column if not exists phone text;
