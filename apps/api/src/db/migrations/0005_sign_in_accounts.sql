-- The accounts offered on the sign-in page are flagged by listed_for_sign_in. The row-level
-- policy on app_user follows the rename by itself; the integrity check's body is text, so it is
-- redefined with the new column.

ALTER TABLE app_user RENAME COLUMN is_listed TO listed_for_sign_in;

CREATE OR REPLACE FUNCTION ops.verify_integrity() RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE
  m ops.seed_manifest;
  now_counts jsonb := ops.base_counts();
  n bigint;
BEGIN
  SELECT * INTO m FROM ops.seed_manifest ORDER BY id DESC LIMIT 1;
  IF NOT FOUND THEN RETURN 'no seed manifest in this database'; END IF;
  IF now_counts <> m.counts THEN RETURN format('base row counts differ: expected %s, found %s', m.counts, now_counts); END IF;
  IF ops.rent_checksum() <> m.rent_checksum THEN RETURN 'lease rent checksum differs from the manifest'; END IF;

  SELECT count(*) INTO n FROM lease l WHERE l.sandbox_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM lease_party p WHERE p.lease_row_id = l.id AND p.role = 'LANDLORD');
  IF n > 0 THEN RETURN format('%s leases have no landlord', n); END IF;

  SELECT count(*) INTO n FROM lease l WHERE l.sandbox_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM deposit d WHERE d.lease_row_id = l.id);
  IF n > 0 THEN RETURN format('%s leases have no deposit', n); END IF;

  SELECT count(*) INTO n FROM tenant t WHERE NOT EXISTS (SELECT 1 FROM app_user u WHERE u.tenant_id = t.id AND u.listed_for_sign_in);
  IF n > 0 THEN RETURN format('%s companies have no sign-in accounts', n); END IF;

  RETURN 'ok';
END $$;
