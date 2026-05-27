# Promo Ad Manager Auto

Automation for this flow:

```text
Notion Activities task
→ Design Status = Approved for Ad
→ Ad Status = Approved for Ad
→ Ad Status = Ready to Upload
→ Google Drive creative download
→ Facebook image/video asset upload + first copy set generation
→ Dashboard review + Ad link
→ Launch paused ad in Meta
→ Notion + PostgreSQL updated
```

## User Flow

1. Designer finishes the creative in Notion and sets `Design Status = Approved for Ad`.
2. The service copies `Final project` to `Google Drive Link` when needed and sets `Ad Status = Approved for Ad`.
3. PR/marketing sets `Ad Status = Ready to Upload`.
4. This service uploads every creative from the Drive file/folder to Meta, groups size variants with the same normalized concept name, generates one initial text/title/CTA set, and sets `Ad Status = Ready to Launch`.
5. PR/marketing opens `/dashboard`, reviews or edits copy/grouping, adds the Ad link, optionally generates more variants, chooses the Meta Campaign + AdSet for one or many creative sets, and clicks `Launch`.
6. This service creates paused Meta ads with the selected campaign/ad set and sets `Ad Status = Launched`.

Ready creatives can now store multiple primary text variants and multiple Meta CTA button types. A single asset with one text/CTA still launches through the original `object_story_spec` path; multiple copy variants or placement-specific asset groups launch through Meta `asset_feed_spec`.

## Notion Fields

The service expects these fields in `Activities`:

- `Design Status`
- `Ad Status`
- `Final project`
- `Google Drive Link`
- `Ad link` / `CTA Link` (optional in Notion; required before launch)
- `Project Type` (optional; used only as launch naming/context)
- `Facebook Asset ID`
- `Facebook Asset Type`
- `Facebook Ad ID`
- `Ad Error`
- `Ad Uploaded At`
- `Ad Launched At`
- `Ad Last Synced At`
- `Ad Preview URL`

Copy, campaign, and ad set selection are handled in the dashboard. The final launch selection happens in the dashboard and is sent to Meta by Campaign ID + AdSet ID.

If your Notion field casing differs, override the `NOTION_PROP_*` variables.

## Asset Naming

Creative asset filenames are normalized before upload. Spaces, uppercase letters, punctuation, and common copy suffixes like `-1` are converted into an upload-safe lowercase filename. Preferred source names use lowercase latin letters, numbers, underscores, and `&` only:

```text
monYY_vacancy_[business_]concept_format_vN_size
```

Examples:

```text
jan26_data_engin_ga_con1_stat_v1_1x1
jan26_data_engin_ga_con1_stat_v1_9x16
jan26_data_engin_ga_con1_stat_v1_4x5
jan26_data_engin_ga_con1_video_v1_16x9
```

Accepted optional business tokens: `ga`, `ug`, `wisey`, `forma`, `ruut`, `sg`/`s&g`.
Accepted formats: `stat` for images, `video` for videos.
Accepted size suffixes: `1x1`, `4x5`, `9x16`, `16x9`.

Files with the same normalized name before the final size suffix are treated as one creative set. Default placement roles are:

- `1x1` / `4x5`: feed
- `9x16`: stories/reels
- `16x9`: horizontal placements

The dashboard shows each creative set before launch and lets users change the asset role, move an asset into another set, split an asset into its own set, or mark an asset as not used.

## Local Setup

```bash
npm install
cp .env.example .env
npm run dev
```

The API runs on `http://localhost:3000`.

For UI development:

```bash
npm run dev:ui
```

The UI runs on `http://localhost:5173` and proxies `/api` to the backend.

## Webhooks

Endpoint:

```text
POST /webhook/notion
```

For native Notion webhooks, set:

```text
NOTION_WEBHOOK_SECRET=
```

For Notion database automation "Send webhook", use a shared header if available:

```text
X-Webhook-Secret: value-from-WEBHOOK_SHARED_SECRET
```

Payload can be minimal:

```json
{
  "pageId": "notion-page-id"
}
```

The backend fetches the page from Notion, so the webhook does not need to include all fields.

## Google Drive

Use a Google Cloud service account:

1. Create a Google Cloud project.
2. Enable Google Drive API.
3. Create a service account.
4. Generate a JSON key.
5. Share the Drive folder with the service account email.
6. Put the JSON into `GOOGLE_SERVICE_ACCOUNT_JSON` on Railway.

Local alternative:

```text
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
```

## Meta Setup

Required variables:

```text
FB_ACCESS_TOKEN=
FB_AD_ACCOUNT_ID=
FB_PAGE_ID=
```

Recommended token permissions:

- `ads_read`
- `ads_management`
- sometimes `business_management`, depending on how the Business Manager is configured

Campaigns and ad sets are read live from Meta in the dashboard. If `NOTION_CAMPAIGNS_DATABASE_ID` is still configured, this optional endpoint also mirrors campaigns into Notion:

```text
POST /api/campaigns/sync
```

Launch behavior:

- The dashboard reads live Campaigns from Meta.
- After a Campaign is selected, the dashboard reads that Campaign's existing AdSets from Meta.
- Launch creates the ad in the selected AdSet ID with paused status by default. The backend validates that the selected AdSet belongs to the selected Campaign.
- Creating Campaigns/AdSets from scratch is intentionally left for a later iteration.

## AI Copy Generation

The ready creative modal can generate primary text and CTA type variants from the creative's existing context through OpenRouter.

```text
OPENROUTER_API_KEY=
OPENROUTER_MODEL=anthropic/claude-sonnet-4.6
```

Claude Sonnet 4.6 is the recommended starting model for this workflow. If `OPENROUTER_MODEL` is empty, OpenRouter uses the account default.

## Okta

The dashboard supports Okta OIDC Authorization Code + PKCE.

Local development can use:

```text
AUTH_DISABLED=true
VITE_AUTH_DISABLED=true
```

Production should use:

```text
AUTH_DISABLED=false
VITE_AUTH_DISABLED=false
OKTA_ISSUER=
OKTA_CLIENT_ID=
VITE_OKTA_ISSUER=
VITE_OKTA_CLIENT_ID=
VITE_OKTA_REDIRECT_URI=https://your-railway-domain/login/callback
```

## Railway

1. Create a Railway project.
2. Add PostgreSQL.
3. Connect the GitHub repo.
4. Set all variables in Railway Variables.
5. Deploy.

The app serves both backend and UI from one Railway service.

Useful URLs:

- `/healthz`
- `/dashboard`
- `/launched`

## Safety

- Secrets are never committed.
- Facebook requests/responses are logged in `facebook_request_logs`.
- Pipeline actions are logged in `automation_events`.
- Upload and launch failures update `Ad Error` in Notion.
- `MOCK_FACEBOOK=true` can be used for end-to-end dry runs without touching Meta.
