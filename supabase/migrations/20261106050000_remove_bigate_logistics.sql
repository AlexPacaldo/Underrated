drop function if exists public.logistics_record_tracking_event(
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  text,
  text,
  jsonb
);

drop view if exists public.order_tracking_updates;

revoke all on table public.shipments from public, anon, authenticated, service_role;
revoke all on table public.logistics_events from public, anon, authenticated, service_role;
