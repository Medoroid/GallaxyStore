-- Fix: the SELECT policy on user_designs called SECURITY DEFINER owns_design(),
-- which could not see a just-inserted row during INSERT ... RETURNING, so
-- Creator Studio design creation failed with 42501. Check owner_id directly.
drop policy if exists designs_select_public_or_owner_or_admin on public.user_designs;
create policy designs_select_public_or_owner_or_admin on public.user_designs
  for select to anon, authenticated
  using (
    (status = 'approved' and is_public and deleted_at is null)
    or owner_id = auth.uid()
    or public.is_admin()
  );
