-- The dashboard asks whether each decision it lists already has an open task; tasks are found by their
-- key date, which had no index.
CREATE INDEX task_key_date ON task (key_date_id) WHERE key_date_id IS NOT NULL;
