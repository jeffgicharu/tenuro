-- The person's view of a lease, key date, task or saved view is identified by coalesce(origin_id, id):
-- a changed copy answers to the id of the row it replaces. Lookups by that id (a lease page, the
-- dashboard's next date of each kind, a reminder's key date, the lease loader) had no index to use
-- and scanned the whole table each time. Postgres folds these views into the query, so an index on
-- the same expression serves them directly.

CREATE INDEX lease_view_id ON lease ((coalesce(origin_id, id)));
CREATE INDEX key_date_view_id ON key_date ((coalesce(origin_id, id)));
CREATE INDEX task_view_id ON task ((coalesce(origin_id, id)));
CREATE INDEX saved_view_view_id ON saved_view ((coalesce(origin_id, id)));
