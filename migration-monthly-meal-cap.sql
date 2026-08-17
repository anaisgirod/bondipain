-- Plafond mensuel en NOMBRE de menus couverts par employé (en plus du plafond en Rs).
-- 1 menu = 1 plat commandé (quantité comprise). Les deux plafonds coexistent : la
-- couverture s'arrête dès que l'un des deux est atteint. NULL = pas de limite.

-- 1) Le plafond de menus se définit sur la règle de contribution (comme monthly_cap).
alter table contribution_rules
  add column if not exists monthly_meal_cap integer;

-- 2) Suivi du nombre de menus déjà couverts dans le mois, par employé.
alter table employee_budget_ledger
  add column if not exists meals_covered integer not null default 0;

-- 3) Nombre de menus couverts par commande (pour recréditer proprement en cas d'annulation).
alter table b2e_orders
  add column if not exists covered_meals integer;
