CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS creatives (
  id BIGSERIAL PRIMARY KEY,
  notion_task_id TEXT NOT NULL UNIQUE,
  notion_task_url TEXT,
  asset_id TEXT,
  asset_type TEXT CHECK (asset_type IS NULL OR asset_type IN ('image', 'video')),
  ad_text TEXT,
  cta_link TEXT,
  audience TEXT,
  location TEXT,
  campaign_id TEXT,
  campaign_name TEXT,
  project_type TEXT,
  status TEXT NOT NULL,
  google_drive_url TEXT,
  preview_url TEXT,
  facebook_ad_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_at TIMESTAMPTZ,
  launched_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS creatives_status_idx ON creatives(status);
CREATE INDEX IF NOT EXISTS creatives_campaign_id_idx ON creatives(campaign_id);

CREATE TABLE IF NOT EXISTS automation_events (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT,
  creative_id BIGINT REFERENCES creatives(id) ON DELETE SET NULL,
  notion_task_id TEXT,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS automation_events_notion_task_id_idx ON automation_events(notion_task_id);
CREATE INDEX IF NOT EXISTS automation_events_created_at_idx ON automation_events(created_at);

CREATE TABLE IF NOT EXISTS facebook_request_logs (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT,
  method TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  status_code INTEGER,
  request_body JSONB,
  response_body JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS facebook_request_logs_request_id_idx ON facebook_request_logs(request_id);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS creatives_set_updated_at ON creatives;
CREATE TRIGGER creatives_set_updated_at
BEFORE UPDATE ON creatives
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
