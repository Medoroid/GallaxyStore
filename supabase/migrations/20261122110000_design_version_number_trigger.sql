-- Fix: design_versions.version_number is NOT NULL but no trigger ever
-- assigned it (function set_design_version_number() existed in the baseline
-- but was never wired). Creator Studio design creation failed with 23502.
drop trigger if exists set_design_version_number on public.design_versions;
create trigger set_design_version_number
  before insert on public.design_versions
  for each row execute function public.set_design_version_number();
