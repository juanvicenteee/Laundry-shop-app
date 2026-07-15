-- Bubbly-fi — security fix: gate handle_new_user() on auth provider
--
-- This file exists to capture in git a fix that was already applied ad hoc
-- via the Supabase SQL Editor, during a live debugging session. It is not
-- new logic — it's the "1. Fix the staff-provisioning trigger to not fire
-- for OAuth signups" section from migrate-mobile-app-v4-customer-accounts.sql,
-- extracted on its own.
--
-- BACKGROUND: while integrating this app's customer-facing mobile apps, we
-- discovered a separate AI session had already built a complete, independent
-- backend for customer accounts, addresses, wash preferences, cart recovery,
-- marketing, and referrals/coupons directly against this Supabase project
-- (no source file exists anywhere — it's only visible via the live schema).
-- That backend's customer_profiles/handle_new_bubblyfi_user() is what's
-- actually in use; DO NOT run migrate-mobile-app-v4-customer-accounts.sql —
-- its customer_profiles table has a different (incompatible) shape than the
-- one that's actually live, and running it will error or corrupt data.
--
-- The one part of v4 that IS still needed is this fix. The existing
-- public.handle_new_user() trigger fires on EVERY insert into auth.users and
-- unconditionally inserts a row into public.profiles, granting role='operator'
-- to anyone whose email isn't literally admin@bubblyfi.app. Since customers
-- now sign up via Google/Facebook OAuth (handled by the separate
-- handle_new_bubblyfi_user() trigger, which is fine as-is), every customer
-- signup would ALSO silently receive a staff 'operator' role from this
-- trigger — full access to orders, customers, inventory, and every
-- admin-only RPC in the operations app.
--
-- The fix: gate the insert on raw_app_meta_data->>'provider' = 'email',
-- since staff accounts are always created as email+password (Supabase
-- dashboard) and customer accounts always sign up via OAuth. That split is
-- not spoofable by the signing-up user, unlike a metadata key they could set
-- themselves.
--
-- Run this in the Supabase SQL Editor for project amjhrejmcnthlrqddznw.
-- Safe to run again even though it was already applied ad hoc — CREATE OR
-- REPLACE is idempotent.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_app_meta_data->>'provider' = 'email' then
    insert into public.profiles (id, email, display_name, role)
    values (
      new.id,
      new.email,
      split_part(new.email, '@', 1),
      case when lower(new.email) = 'admin@bubblyfi.app' then 'admin' else 'operator' end
    )
    on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  end if;
  return new;
end;
$$;
