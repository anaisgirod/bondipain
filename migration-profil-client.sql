-- ============================================================
-- MIGRATION — Profil client B2C enrichi (adresse de livraison)
-- À exécuter UNE FOIS dans Supabase (SQL Editor). Idempotent.
-- ============================================================

alter table customers add column if not exists company  text;
alter table customers add column if not exists building text;
alter table customers add column if not exists town     text;
alter table customers add column if not exists locality text;
