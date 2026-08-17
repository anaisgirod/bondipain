-- Annulation de commande par le client (Particulier / B2C).
-- Permet au client connecté de modifier UNIQUEMENT ses propres commandes
-- (utilisé pour passer le statut à « cancelled » depuis « Mon compte »).
-- À exécuter dans Supabase → SQL Editor.
--
-- Note : côté Employé (table b2e_orders), l'annulation fonctionne déjà via la
-- politique existante qui autorise l'employé à mettre à jour ses commandes
-- (la même que celle utilisée pour la note/rating). Aucune action requise pour le B2E.

alter table public.orders enable row level security;

drop policy if exists "orders_owner_update" on public.orders;
create policy "orders_owner_update"
  on public.orders for update
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());
