-- STAGING-ONLY SYNTHETIC DATA. No real customers, orders, payments or PII.
-- Safe to wipe by re-creating this project; never run against Production.

insert into public.products (id, name, slug, short_description, status, visibility, base_price, currency, is_featured)
values
  ('11111111-1111-1111-1111-111111111301','Classic Galaxy Tee','classic-galaxy-tee','Synthetic staging tee','published','visible',450,'EGP',true),
  ('11111111-1111-1111-1111-111111111302','Galaxy Hoodie','galaxy-hoodie','Synthetic staging hoodie','published','visible',850,'EGP',true),
  ('11111111-1111-1111-1111-111111111303','Cosmic Mug','cosmic-mug','Synthetic staging mug','published','visible',280,'EGP',true),
  ('11111111-1111-1111-1111-111111111304','Nebula Poster','nebula-poster','Synthetic staging poster','published','visible',350,'EGP',false),
  ('11111111-1111-1111-1111-111111111305','Star Phone Case','star-phone-case','Synthetic staging case','published','visible',400,'EGP',false)
on conflict (id) do update set name=excluded.name, status='published', visibility='visible';

insert into public.product_variants (id, product_id, sku, price, stock_quantity, is_active, is_default)
values
  ('11111111-1111-1111-1111-111111111401','11111111-1111-1111-1111-111111111301','TEE-M-BLK',450,25,true,true),
  ('11111111-1111-1111-1111-111111111402','11111111-1111-1111-1111-111111111301','TEE-L-BLK',450,18,true,false),
  ('11111111-1111-1111-1111-111111111403','11111111-1111-1111-1111-111111111302','HDL-M-GRY',850,12,true,true),
  ('11111111-1111-1111-1111-111111111404','11111111-1111-1111-1111-111111111303','MUG-STD',280,40,true,true),
  ('11111111-1111-1111-1111-111111111405','11111111-1111-1111-1111-111111111304','POST-A3',350,30,true,true),
  ('11111111-1111-1111-1111-111111111406','11111111-1111-1111-1111-111111111305','CASE-15',400,20,true,true)
on conflict (id) do update set is_active=true;

insert into public.products (id, name, slug, short_description, status, visibility, base_price, currency, is_featured)
values ('22222222-2222-4222-8222-000000000001','Staging Gift Box','staging-gift-box','Synthetic gift box','published','visible',900,'EGP',true)
on conflict (id) do update set status='published', visibility='visible';
insert into public.product_variants (id, product_id, sku, price, stock_quantity, is_active, is_default)
values ('22222222-2222-4222-8222-000000000011','22222222-2222-4222-8222-000000000001','GB-STAGING',900,50,true,true)
on conflict (id) do update set stock_quantity=50, is_active=true;
insert into public.gift_boxes (product_id) values ('22222222-2222-4222-8222-000000000001') on conflict (product_id) do nothing;
insert into public.gift_box_items (gift_box_product_id, product_id, variant_id, quantity, display_order, is_active)
values
  ('22222222-2222-4222-8222-000000000001','11111111-1111-1111-1111-111111111301','11111111-1111-1111-1111-111111111401',1,1,true),
  ('22222222-2222-4222-8222-000000000001','11111111-1111-1111-1111-111111111302','11111111-1111-1111-1111-111111111403',1,2,true)
on conflict do nothing;
