-- STAGING-ONLY synthetic roles and stores. No real customer data.
update public.profiles set role = 'admin'    where id in (select id from auth.users where email = 'admin@staging.test');
update public.profiles set role = 'vendor'   where id in (select id from auth.users where email = 'vendor@staging.test');
update public.profiles set role = 'vendor'   where id in (select id from auth.users where email = 'dual@staging.test');
update public.profiles set role = 'customer' where id in (select id from auth.users where email = 'customer@staging.test');

insert into public.admin_users (user_id, role)
select id, 'admin' from auth.users where email in ('admin@staging.test','dual@staging.test')
on conflict (user_id) do update set role = excluded.role;

insert into public.stores (owner_id, name, slug, status)
select id, 'Staging Vendor Store', 'staging-vendor-store', 'approved'
  from auth.users where email = 'vendor@staging.test'
on conflict (slug) do nothing;

insert into public.stores (owner_id, name, slug, status)
select id, 'Staging Dual Store A', 'staging-dual-store-a', 'approved'
  from auth.users where email = 'dual@staging.test'
on conflict (slug) do nothing;

insert into public.stores (owner_id, name, slug, status)
select id, 'Staging Dual Store B', 'staging-dual-store-b', 'approved'
  from auth.users where email = 'dual@staging.test'
on conflict (slug) do nothing;
