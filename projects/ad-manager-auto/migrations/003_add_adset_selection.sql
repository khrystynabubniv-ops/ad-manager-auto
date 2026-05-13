ALTER TABLE creatives
ADD COLUMN IF NOT EXISTS adset_id TEXT,
ADD COLUMN IF NOT EXISTS adset_name TEXT;

CREATE INDEX IF NOT EXISTS creatives_adset_id_idx ON creatives(adset_id);
