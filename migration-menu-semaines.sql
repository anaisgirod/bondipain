-- ============================================================
-- MIGRATION — Menu du jour PAR SEMAINE
-- À exécuter UNE FOIS dans Supabase (SQL Editor) avant d'utiliser
-- le sélecteur de semaine de l'admin.
-- Sans risque : idempotent, ne supprime aucune donnée.
-- ============================================================

-- 1. Colonnes semaine + photo
alter table daily_menu add column if not exists week text;
alter table daily_menu add column if not exists image_url text;

-- 2. Rattacher les lignes existantes à la semaine en cours (lundi, heure de Maurice)
update daily_menu
  set week = to_char(date_trunc('week', (now() at time zone 'Indian/Mauritius')), 'YYYY-MM-DD')
  where week is null or week = '';

alter table daily_menu alter column week set not null;

-- 3. Nouvelle contrainte d'unicité : une ligne par (semaine, jour, type)
alter table daily_menu drop constraint if exists daily_menu_day_type_key;
do $$ begin
  alter table daily_menu add constraint daily_menu_week_day_type_key unique (week, day, type);
exception
  when duplicate_object then null;   -- contrainte déjà présente
  when duplicate_table  then null;   -- index du même nom déjà présent (42P07)
end $$;
