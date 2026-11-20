-- Fix: idx_files_checksum was a GLOBAL unique index on the artwork checksum.
-- Uploading the same image into two different designs (or retrying an upload)
-- failed with 23505. A checksum is a content identifier, not a unique key for
-- a file row: each design version needs its own design_files row.
-- Keep the column indexed for dedupe lookups, but allow legitimate duplicates.
drop index if exists public.idx_files_checksum;
create index idx_files_checksum on public.design_files using btree (checksum_sha256)
  where checksum_sha256 is not null;
