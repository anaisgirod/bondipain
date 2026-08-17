-- ============================================================
-- BONDIPAIN — Infos de livraison sur les commandes Particulier
-- Ajoute nom / téléphone / adresse à la table orders pour que la
-- cuisine (vue Kitchen) sache où livrer les commandes Particulier.
-- À exécuter dans Supabase → SQL Editor. Idempotent.
-- ============================================================

alter table orders add column if not exists customer_name    text;
alter table orders add column if not exists customer_phone   text;
alter table orders add column if not exists delivery_address  text;
