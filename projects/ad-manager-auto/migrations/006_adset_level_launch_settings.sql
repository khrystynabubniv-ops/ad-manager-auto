ALTER TABLE adset_drafts
ADD COLUMN IF NOT EXISTS destination_type TEXT NOT NULL DEFAULT 'WEBSITE',
ADD COLUMN IF NOT EXISTS conversion_event TEXT,
ADD COLUMN IF NOT EXISTS bid_amount_minor INTEGER CHECK (bid_amount_minor IS NULL OR bid_amount_minor > 0),
ADD COLUMN IF NOT EXISTS attribution_setting TEXT,
ADD COLUMN IF NOT EXISTS is_dynamic_creative BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS use_advantage_audience BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS saved_audience_id TEXT,
ADD COLUMN IF NOT EXISTS audience_controls JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS audience_recommendations JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS placement_mode TEXT NOT NULL DEFAULT 'ADVANTAGE_PLUS',
ADD COLUMN IF NOT EXISTS placement_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS brand_safety_controls JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS pacing_type TEXT,
ADD COLUMN IF NOT EXISTS adset_schedule JSONB,
ADD COLUMN IF NOT EXISTS frequency_control_specs JSONB,
ADD COLUMN IF NOT EXISTS beneficiary TEXT,
ADD COLUMN IF NOT EXISTS payor TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'adset_drafts_budget_check'
  ) THEN
    ALTER TABLE adset_drafts
    ADD CONSTRAINT adset_drafts_budget_check CHECK (
      daily_budget_minor IS NULL OR lifetime_budget_minor IS NULL
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'adset_drafts_placement_mode_check'
  ) THEN
    ALTER TABLE adset_drafts
    ADD CONSTRAINT adset_drafts_placement_mode_check CHECK (
      placement_mode IN ('ADVANTAGE_PLUS', 'MANUAL')
    );
  END IF;
END $$;
