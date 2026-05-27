ALTER TABLE creatives
ADD COLUMN IF NOT EXISTS creative_group_key TEXT,
ADD COLUMN IF NOT EXISTS creative_group_name TEXT,
ADD COLUMN IF NOT EXISTS asset_placement TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN IF NOT EXISTS grouping_status TEXT NOT NULL DEFAULT 'auto';

UPDATE creatives
SET creative_group_key = COALESCE(
    creative_group_key,
    NULLIF(
      regexp_replace(
        lower(regexp_replace(COALESCE(source_file_name, source_file_id, notion_task_id), '\.[^.]*$', '')),
        '_(1x1|4x5|9x16|16x9)$',
        ''
      ),
      ''
    ),
    source_file_id,
    notion_task_id
  ),
  creative_group_name = COALESCE(
    creative_group_name,
    NULLIF(
      replace(
        regexp_replace(
          lower(regexp_replace(COALESCE(source_file_name, source_file_id, notion_task_id), '\.[^.]*$', '')),
          '_(1x1|4x5|9x16|16x9)$',
          ''
        ),
        '_',
        ' '
      ),
      ''
    ),
    source_file_name,
    project_type,
    source_file_id,
    notion_task_id
  ),
  asset_placement = CASE
    WHEN asset_placement <> 'unknown' THEN asset_placement
    WHEN lower(COALESCE(source_file_name, '')) ~ '_(1x1|4x5)(\.[^.]+)?$' THEN 'feed'
    WHEN lower(COALESCE(source_file_name, '')) ~ '_9x16(\.[^.]+)?$' THEN 'stories_reels'
    WHEN lower(COALESCE(source_file_name, '')) ~ '_16x9(\.[^.]+)?$' THEN 'horizontal'
    ELSE asset_placement
  END;

ALTER TABLE creatives
ALTER COLUMN creative_group_key SET NOT NULL,
ALTER COLUMN creative_group_name SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'creatives_asset_placement_check'
  ) THEN
    ALTER TABLE creatives
    ADD CONSTRAINT creatives_asset_placement_check
    CHECK (asset_placement IN ('feed', 'stories_reels', 'horizontal', 'unknown', 'do_not_use'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'creatives_grouping_status_check'
  ) THEN
    ALTER TABLE creatives
    ADD CONSTRAINT creatives_grouping_status_check
    CHECK (grouping_status IN ('auto', 'manual'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS creatives_group_idx
ON creatives(notion_task_id, creative_group_key);

CREATE INDEX IF NOT EXISTS creatives_asset_placement_idx
ON creatives(asset_placement);
