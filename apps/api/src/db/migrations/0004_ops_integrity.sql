-- Integrity checks used to prove a backup can be restored. Every nightly rebuild records a manifest
-- of the shared base data; after a restore, ops.verify_integrity() compares the restored database
-- with the manifest it carries and checks the relationships the app relies on.

CREATE SCHEMA IF NOT EXISTS ops;

CREATE TABLE ops.seed_manifest (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at     timestamptz NOT NULL DEFAULT now(),
  counts         jsonb NOT NULL,
  rent_checksum  text NOT NULL
);

-- Base rows only: visitors' private rows come and go, the shared data does not until the next rebuild.
CREATE FUNCTION ops.base_counts() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'tenant',       (SELECT count(*) FROM tenant),
    'app_user',     (SELECT count(*) FROM app_user),
    'property',     (SELECT count(*) FROM property WHERE sandbox_id IS NULL),
    'lease',        (SELECT count(*) FROM lease WHERE sandbox_id IS NULL),
    'lease_party',  (SELECT count(*) FROM lease_party WHERE sandbox_id IS NULL),
    'rent_step',    (SELECT count(*) FROM rent_step WHERE sandbox_id IS NULL),
    'escalation',   (SELECT count(*) FROM escalation WHERE sandbox_id IS NULL),
    'lease_option', (SELECT count(*) FROM lease_option WHERE sandbox_id IS NULL),
    'deposit',      (SELECT count(*) FROM deposit WHERE sandbox_id IS NULL),
    'key_date',     (SELECT count(*) FROM key_date WHERE sandbox_id IS NULL),
    'task',         (SELECT count(*) FROM task WHERE sandbox_id IS NULL),
    'document',     (SELECT count(*) FROM document WHERE sandbox_id IS NULL),
    'activity',     (SELECT count(*) FROM activity WHERE sandbox_id IS NULL),
    'saved_view',   (SELECT count(*) FROM saved_view WHERE sandbox_id IS NULL)
  )
$$;

-- Every base lease's id, rent and dates, in a fixed order: a single changed figure changes the sum.
CREATE FUNCTION ops.rent_checksum() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT md5(coalesce(string_agg(
    id::text || ':' || rent_per_period::text || ':' || annual_rent::text || ':' || commencement_date || ':' || expiry_date,
    ',' ORDER BY id), ''))
  FROM lease WHERE sandbox_id IS NULL
$$;

CREATE FUNCTION ops.record_manifest() RETURNS void LANGUAGE sql AS $$
  INSERT INTO ops.seed_manifest (counts, rent_checksum) VALUES (ops.base_counts(), ops.rent_checksum())
$$;

-- Returns 'ok', or a sentence saying what is wrong.
CREATE FUNCTION ops.verify_integrity() RETURNS text LANGUAGE plpgsql STABLE AS $$
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

  SELECT count(*) INTO n FROM tenant t WHERE NOT EXISTS (SELECT 1 FROM app_user u WHERE u.tenant_id = t.id AND u.is_listed);
  IF n > 0 THEN RETURN format('%s companies have no sign-in accounts', n); END IF;

  RETURN 'ok';
END $$;

-- The data built before this migration gets its manifest now; rebuilds record their own.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM tenant) THEN PERFORM ops.record_manifest(); END IF;
END $$;
