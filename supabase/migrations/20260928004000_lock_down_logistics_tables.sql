-- 20260928004000_lock_down_logistics_tables.sql
-- Removes the default table privileges that Supabase grants on every new table.
--
-- The gap this closes: 20260928000000 created public.shipments and
-- public.logistics_events and enabled RLS on both, but never revoked the grants.
-- Supabase sets `alter default privileges in schema public grant all on tables to
-- postgres, anon, authenticated, service_role`, so both new tables were created
-- with SELECT, INSERT, UPDATE and DELETE held by anon and authenticated.
--
-- Why it is not an active breach: RLS is enabled and no policy matches any role,
-- so every query from anon or authenticated returns zero rows and every write is
-- rejected. The grants are inert while the policies stay absent.
--
-- Why it still matters: this is one policy away from a full read of every
-- customer's waybill and address, and a single `alter table ... disable row level
-- security` during debugging would expose the lot. Defence in depth means the
-- privilege is not the only thing standing between the anon key and the table.
--
-- This file exists rather than editing 20260928000000 because that migration has
-- already been applied.

-- service_role keeps its grants: the webhook and the booking route write through
-- it. Only the browser-facing roles are stripped.
revoke all on table public.shipments from anon, authenticated;
revoke all on table public.logistics_events from anon, authenticated;

-- The customer-facing view is unaffected, and deliberately so: it is declared
-- `security_invoker = off`, which means it runs with the owner's rights rather than
-- the querying role's. Dropping the table grants therefore cannot break a rider
-- reading their own tracking history. If that clause were ever changed to
-- `security_invoker = on`, these two revokes would break the account page.
