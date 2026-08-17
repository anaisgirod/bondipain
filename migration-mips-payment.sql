-- Paiement en ligne MIPS (carte) pour les commandes Particulier (table orders).
-- À exécuter dans Supabase → SQL Editor.

-- Email du client (nécessaire pour envoyer la confirmation après le paiement MIPS).
alter table public.orders add column if not exists customer_email text;
-- Référence de transaction MIPS (pour le suivi / rapprochement).
alter table public.orders add column if not exists payment_ref text;

-- Le statut « pending_payment » est utilisé tant que le paiement carte n'est pas confirmé.
-- (La colonne status est déjà un text libre — rien d'autre à faire.)
