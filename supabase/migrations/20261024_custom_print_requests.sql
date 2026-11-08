-- Persisted custom-print requests.
-- Additive only: the request is a quote/design workflow, not an order.

create table if not exists public.custom_print_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null unique default (
    'CP-' || to_char(now(), 'YYYY') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  ),
  user_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  product_type text not null check (product_type in ('tshirt', 'mug', 'phonecase', 'poster', 'other')),
  size text,
  color text,
  custom_text text,
  notes text,
  design_path text not null,
  design_mime text,
  status text not null default 'new' check (
    status in ('new', 'reviewing', 'quoted', 'accepted', 'in_production', 'completed', 'cancelled')
  ),
  quoted_amount numeric(12, 2) check (quoted_amount is null or quoted_amount >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists custom_print_requests_status_idx
  on public.custom_print_requests (status, created_at desc);
create index if not exists custom_print_requests_email_idx
  on public.custom_print_requests (lower(customer_email));

alter table public.custom_print_requests enable row level security;

-- Customers can read their own requests; admins can read all. Writes happen
-- only through the server route using the service role.
drop policy if exists "custom_print_requests_select_own_or_admin" on public.custom_print_requests;
create policy "custom_print_requests_select_own_or_admin"
  on public.custom_print_requests
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

grant select on public.custom_print_requests to authenticated;

-- Private bucket for customer artwork. Admin reads are signed server-side.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'custom-print-designs',
  'custom-print-designs',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

comment on table public.custom_print_requests is
  'Customer artwork submissions for custom printing. Managed by the server API; not a paid order.';
