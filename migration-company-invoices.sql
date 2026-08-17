-- ============================================================
-- BONDIPAIN — Table des factures entreprises (facturation mensuelle)
-- Suit, par entreprise et par mois, le montant facturé et son statut.
-- À exécuter dans Supabase → SQL Editor. Idempotent.
-- ============================================================

-- Colonnes de facturation sur companies (mode + période)
alter table companies add column if not exists billing_mode   text default 'invoice';
alter table companies add column if not exists billing_period text default 'monthly';

create table if not exists company_invoices (
  id           uuid default gen_random_uuid() primary key,
  company_id   uuid references companies(id) on delete cascade,
  period_month date not null,                 -- 1er jour du mois facturé
  amount       numeric default 0,
  status       text default 'invoiced',       -- 'invoiced' | 'paid'
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique(company_id, period_month)
);

alter table company_invoices enable row level security;

-- Accès réservé aux admins Bondipain (l'API opérateur passe par le service role,
-- qui ignore le RLS ; cette policy couvre un éventuel accès direct authentifié).
do $$ begin
  create policy "Admin gere company_invoices" on company_invoices for all
    using (auth.email() in ('info@bondipain.com','hello@bondipain.com','agirod@gramica.fr'))
    with check (auth.email() in ('info@bondipain.com','hello@bondipain.com','agirod@gramica.fr'));
exception when duplicate_object then null; end $$;
