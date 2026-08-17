-- Codes promo particuliers (B2C) : un code = une remise en Rs (montant fixe).
-- À exécuter dans l'éditeur SQL Supabase.

create table if not exists public.promo_codes (
  code        text primary key,               -- ex. "BIENVENUE" (stocké en MAJUSCULES)
  amount      integer not null default 0,      -- remise en Rs (montant fixe)
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.promo_codes enable row level security;

-- Lecture publique des codes ACTIFS uniquement (pour valider un code au checkout).
drop policy if exists "promo_codes_public_read_active" on public.promo_codes;
create policy "promo_codes_public_read_active"
  on public.promo_codes for select
  using (active = true);

-- Les écritures se font via la clé service (API admin), qui contourne le RLS.
