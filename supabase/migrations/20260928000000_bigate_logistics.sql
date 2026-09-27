-- 20260928000000_bigate_logistics.sql
-- Storage for Bigate Gateway shipments and their tracking callbacks.
--
-- Two tables plus one enum value, deliberately split from the function that
-- writes to them (20260928001000). Postgres cannot use a value added by ALTER
-- TYPE in the same transaction that added it, and the Supabase CLI wraps each
-- migration file in its own transaction, so the value is committed here and only
-- referenced in the next file.
--
-- RLS is enabled with no policies. Nothing the browser or the rider may read
-- belongs in these tables: the only writer is the server through the service
-- role, and customers read shipment progress through the order_tracking_updates
-- view at the bottom, which filters on auth.uid() the same way order_tracking
-- does.

-- Return to sender. A parcel that comes back is not "cancelled" and it is not
-- "delivered", and the existing enum had no way to say so, which meant an RTS
-- callback would have had to be either dropped or misrecorded as delivered.
alter type public.order_status add value if not exists 'returned';

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null default 'bigate' check (provider in ('bigate')),
  -- Our own order number. Carried on the gateway request as the reference so an
  -- unknown-outcome failure can be reconciled against the Bigate dashboard.
  client_reference text not null,
  -- The courier's tracking number. Unique per provider: one AWB, one parcel.
  awb text not null,
  courier_code text not null,
  service_code text,
  -- https link to the generated label, written only after the host allowlist in
  -- the integration has approved it.
  waybill_url text,
  -- Our normalised lifecycle state, not the courier's wording.
  status text not null default 'label_created' check (
    status in ('label_created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'rts', 'failed_attempt', 'cancelled', 'info_received', 'unknown')
  ),
  -- Exactly what the provider said, kept so a new state can be investigated.
  provider_status text,
  parcel_count integer not null default 1 check (parcel_count > 0),
  weight_kg numeric(10, 3) check (weight_kg is null or weight_kg > 0),
  -- Cash the rider collects. Null for a prepaid order.
  cod_amount_cents integer check (cod_amount_cents is null or cod_amount_cents >= 0),
  requested_at timestamptz not null default now(),
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipments_provider_awb_unique unique (provider, awb)
);

-- One live shipment per order, so a replacement parcel after a return can be
-- booked while the returned row is kept for the record. 'rts' is the value the
-- integration writes; the others are the states that close a parcel.
create unique index if not exists shipments_one_active_per_order
  on public.shipments (order_id)
  where status not in ('delivered', 'rts', 'cancelled');

create index if not exists shipments_order_id_idx on public.shipments (order_id);
create index if not exists shipments_status_idx on public.shipments (status);
create index if not exists shipments_client_reference_idx on public.shipments (client_reference);

drop trigger if exists shipments_set_updated_at on public.shipments;
create trigger shipments_set_updated_at
  before update on public.shipments
  for each row execute function public.set_updated_at();

-- Append-only callback log. The unique provider event id is the idempotency key
-- that makes Bigate's retries harmless, so this table must never be pruned
-- without first deciding what a replay would then do.
create table if not exists public.logistics_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'bigate' check (provider in ('bigate')),
  provider_event_id text not null,
  shipment_id uuid references public.shipments(id) on delete set null,
  awb text,
  client_reference text,
  status text not null,
  provider_status text not null,
  occurred_at timestamptz not null,
  description text,
  location text,
  -- The untouched body. An unrecognised state is debuggable only if the original
  -- was kept.
  payload jsonb not null,
  received_at timestamptz not null default now(),
  constraint logistics_events_provider_event_unique unique (provider, provider_event_id)
);

create index if not exists logistics_events_shipment_id_idx on public.logistics_events (shipment_id, occurred_at desc);
create index if not exists logistics_events_awb_idx on public.logistics_events (awb, occurred_at desc);
create index if not exists logistics_events_received_at_idx on public.logistics_events (received_at desc);

alter table public.shipments enable row level security;
alter table public.logistics_events enable row level security;

-- Deliberately no policies: the service role bypasses RLS, and there is no
-- authenticated read of these tables. A rider's progress is served by the view
-- below, which can be granted precisely.

-- Customer-visible tracking history for an order the signed-in rider owns.
-- Mirrors the existing order_tracking view: same auth.uid() filter, same
-- security_invoker = off, so no admin-only column can leak through it.
create or replace view public.order_tracking_updates
with (security_invoker = off)
as
select
  event.shipment_id,
  shipment.order_id,
  event.awb,
  event.status,
  event.provider_status,
  event.occurred_at,
  event.description,
  event.location,
  event.received_at
from public.logistics_events as event
join public.shipments as shipment on shipment.id = event.shipment_id
where exists (
  select 1
  from public.orders as customer_order
  where customer_order.id = shipment.order_id
    and customer_order.user_id = auth.uid()
);

revoke all on public.order_tracking_updates from public, anon;
grant select on public.order_tracking_updates to authenticated;

-- The waybill link is staff-facing, so it is not part of the customer view.
comment on view public.order_tracking_updates is 'Customer-visible Bigate tracking events for the signed-in rider. Excludes waybill_url and admin notes.';
