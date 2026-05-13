ALTER TABLE creatives
ADD COLUMN IF NOT EXISTS source_file_id TEXT,
ADD COLUMN IF NOT EXISTS source_file_name TEXT;

UPDATE creatives
SET source_file_id = notion_task_id
WHERE source_file_id IS NULL;

UPDATE creatives
SET source_file_name = COALESCE(project_type, notion_task_id)
WHERE source_file_name IS NULL;

ALTER TABLE creatives
ALTER COLUMN source_file_id SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'creatives_notion_task_id_key'
  ) THEN
    ALTER TABLE creatives DROP CONSTRAINT creatives_notion_task_id_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS creatives_notion_task_source_file_idx
ON creatives(notion_task_id, source_file_id);

CREATE INDEX IF NOT EXISTS creatives_source_file_id_idx
ON creatives(source_file_id);
