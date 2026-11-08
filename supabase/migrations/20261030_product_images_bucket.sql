-- Reproducible product-images bucket and policies (review only).
--
-- The live bucket exists but is not created by any repository migration. A
-- fresh environment therefore has no place to upload product images, and the
-- bucket's MIME/size limits would silently differ.
--
-- The policy uses the product UUID as the first path segment. The vendor image
-- API validates the same shape before uploading.

-- The policies call this live baseline helper. Fail early with a clear message
-- instead of creating a bucket whose policies cannot be installed.
do $$
begin
  if to_regprocedure('public.owns_product(uuid)') is null then
    raise exception 'Dependency missing: public.owns_product(uuid)';
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists product_images_owner_insert on storage.objects;
create policy product_images_owner_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and public.owns_product(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists product_images_owner_update on storage.objects;
create policy product_images_owner_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'product-images'
    and public.owns_product(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists product_images_owner_delete on storage.objects;
create policy product_images_owner_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and public.owns_product(((storage.foldername(name))[1])::uuid)
  );
