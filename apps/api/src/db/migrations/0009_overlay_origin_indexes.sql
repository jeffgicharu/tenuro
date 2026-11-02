-- 0008's indexes on coalesce(origin_id, id) are never used: row-level security will not evaluate that
-- expression ahead of its policy. Lookups by view id now also say "id = $1 OR origin_id = $1", which
-- the primary key and these origin indexes serve (see src/db/viewid.ts). Dropping the unused indexes
-- also spares the nightly rebuild from maintaining them.

DROP INDEX lease_view_id;
DROP INDEX key_date_view_id;
DROP INDEX task_view_id;
DROP INDEX saved_view_view_id;

CREATE INDEX lease_origin_id ON lease (origin_id) WHERE origin_id IS NOT NULL;
CREATE INDEX key_date_origin_id ON key_date (origin_id) WHERE origin_id IS NOT NULL;
CREATE INDEX task_origin_id ON task (origin_id) WHERE origin_id IS NOT NULL;
CREATE INDEX saved_view_origin_id ON saved_view (origin_id) WHERE origin_id IS NOT NULL;
