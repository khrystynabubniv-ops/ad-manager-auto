CREATE TABLE IF NOT EXISTS campaign_drafts (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  objective TEXT NOT NULL DEFAULT 'OUTCOME_TRAFFIC',
  buying_type TEXT NOT NULL DEFAULT 'AUCTION',
  special_ad_categories TEXT[] NOT NULL DEFAULT '{}'::text[],
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'publishing', 'published', 'publish_failed', 'archived')),
  meta_status TEXT NOT NULL DEFAULT 'PAUSED',
  meta_campaign_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaign_drafts_status_idx ON campaign_drafts(status);
CREATE INDEX IF NOT EXISTS campaign_drafts_meta_campaign_id_idx ON campaign_drafts(meta_campaign_id);
CREATE INDEX IF NOT EXISTS campaign_drafts_updated_at_idx ON campaign_drafts(updated_at);

DROP TRIGGER IF EXISTS campaign_drafts_set_updated_at ON campaign_drafts;
CREATE TRIGGER campaign_drafts_set_updated_at
BEFORE UPDATE ON campaign_drafts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS adset_drafts (
  id BIGSERIAL PRIMARY KEY,
  campaign_draft_id BIGINT NOT NULL REFERENCES campaign_drafts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  optimization_goal TEXT NOT NULL DEFAULT 'LINK_CLICKS',
  billing_event TEXT NOT NULL DEFAULT 'IMPRESSIONS',
  bid_strategy TEXT,
  daily_budget_minor INTEGER CHECK (daily_budget_minor IS NULL OR daily_budget_minor > 0),
  lifetime_budget_minor INTEGER CHECK (lifetime_budget_minor IS NULL OR lifetime_budget_minor > 0),
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  targeting JSONB NOT NULL DEFAULT '{}'::jsonb,
  promoted_object JSONB,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'publishing', 'published', 'publish_failed', 'archived')),
  meta_status TEXT NOT NULL DEFAULT 'PAUSED',
  meta_adset_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT adset_drafts_budget_window_check CHECK (
    start_time IS NULL OR end_time IS NULL OR end_time > start_time
  )
);

CREATE INDEX IF NOT EXISTS adset_drafts_campaign_draft_id_idx ON adset_drafts(campaign_draft_id);
CREATE INDEX IF NOT EXISTS adset_drafts_status_idx ON adset_drafts(status);
CREATE INDEX IF NOT EXISTS adset_drafts_meta_adset_id_idx ON adset_drafts(meta_adset_id);
CREATE INDEX IF NOT EXISTS adset_drafts_sort_order_idx ON adset_drafts(campaign_draft_id, sort_order, id);

DROP TRIGGER IF EXISTS adset_drafts_set_updated_at ON adset_drafts;
CREATE TRIGGER adset_drafts_set_updated_at
BEFORE UPDATE ON adset_drafts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS ad_drafts (
  id BIGSERIAL PRIMARY KEY,
  adset_draft_id BIGINT NOT NULL REFERENCES adset_drafts(id) ON DELETE CASCADE,
  creative_id BIGINT NOT NULL REFERENCES creatives(id) ON DELETE RESTRICT,
  name TEXT,
  primary_text TEXT,
  headline TEXT,
  description TEXT,
  cta_type TEXT NOT NULL DEFAULT 'LEARN_MORE',
  cta_link TEXT,
  display_link TEXT,
  url_tags TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'publishing', 'published', 'publish_failed', 'archived')),
  meta_status TEXT NOT NULL DEFAULT 'PAUSED',
  meta_adcreative_id TEXT,
  meta_ad_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_drafts_adset_draft_id_idx ON ad_drafts(adset_draft_id);
CREATE INDEX IF NOT EXISTS ad_drafts_creative_id_idx ON ad_drafts(creative_id);
CREATE INDEX IF NOT EXISTS ad_drafts_status_idx ON ad_drafts(status);
CREATE INDEX IF NOT EXISTS ad_drafts_meta_ad_id_idx ON ad_drafts(meta_ad_id);
CREATE INDEX IF NOT EXISTS ad_drafts_sort_order_idx ON ad_drafts(adset_draft_id, sort_order, id);

DROP TRIGGER IF EXISTS ad_drafts_set_updated_at ON ad_drafts;
CREATE TRIGGER ad_drafts_set_updated_at
BEFORE UPDATE ON ad_drafts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
