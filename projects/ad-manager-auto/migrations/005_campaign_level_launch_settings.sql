ALTER TABLE campaign_drafts
  ADD COLUMN IF NOT EXISTS campaign_settings_mode TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS budget_strategy TEXT NOT NULL DEFAULT 'AD_SET',
  ADD COLUMN IF NOT EXISTS campaign_daily_budget_minor INTEGER CHECK (
    campaign_daily_budget_minor IS NULL OR campaign_daily_budget_minor > 0
  ),
  ADD COLUMN IF NOT EXISTS campaign_lifetime_budget_minor INTEGER CHECK (
    campaign_lifetime_budget_minor IS NULL OR campaign_lifetime_budget_minor > 0
  ),
  ADD COLUMN IF NOT EXISTS bid_strategy TEXT,
  ADD COLUMN IF NOT EXISTS spend_cap_minor INTEGER CHECK (
    spend_cap_minor IS NULL OR spend_cap_minor > 0
  ),
  ADD COLUMN IF NOT EXISTS special_ad_category_countries TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS promoted_object JSONB,
  ADD COLUMN IF NOT EXISTS budget_schedule_specs JSONB,
  ADD COLUMN IF NOT EXISTS is_skadnetwork_attribution BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS a_b_test_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS live_ads_enabled BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'campaign_drafts_budget_strategy_check'
  ) THEN
    ALTER TABLE campaign_drafts
      ADD CONSTRAINT campaign_drafts_budget_strategy_check CHECK (
        budget_strategy IN ('AD_SET', 'CAMPAIGN')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'campaign_drafts_campaign_budget_check'
  ) THEN
    ALTER TABLE campaign_drafts
      ADD CONSTRAINT campaign_drafts_campaign_budget_check CHECK (
        campaign_daily_budget_minor IS NULL OR campaign_lifetime_budget_minor IS NULL
      );
  END IF;
END $$;
