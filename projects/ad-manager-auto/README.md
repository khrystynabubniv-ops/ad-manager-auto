# Promo Ad Manager Auto

Automation for this flow:

```text
Notion Activities task
→ Ad Status = Ready to Upload
→ Google Drive creative download
→ Facebook image/video asset upload
→ Dashboard review
→ Launch ad in Meta
→ Notion + PostgreSQL updated
```

## User Flow

1. Designer finishes the creative in Notion and sets `Design Status = Approved for Ad`.
2. Notion automation copies `Final project` to `Google Drive Link` and sets `Ad Status = Needs Ad Details`.
3. PR/marketing fills ad fields in the `Ads` view.
4. PR/marketing sets `Ad Status = Ready to Upload`.
5. This service uploads the creative to Meta and sets `Ad Status = Ready to Launch`.
6. PR/marketing opens `/dashboard`, reviews the ad, chooses the Meta Campaign + AdSet, and clicks `Launch`.
7. This service creates the Meta ad and sets `Ad Status = Launched`.

Ready creatives can now store multiple primary text variants and multiple Meta CTA button types. A single text/CTA still launches through the original `object_story_spec` path; multiple variants launch through Meta `asset_feed_spec`.

## Notion Fields

The service expects these fields in `Activities`:

- `Design Status`
- `Ad Status`
- `Final project`
- `Google Drive Link`
- `Ad Text`
- `CTA Link`
- `Project Type`
- `Audience`
- `Location`
- `Facebook Campaign` (optional prefill)
- `Facebook Campaign ID` (optional prefill)
- `Facebook Asset ID`
- `Facebook Asset Type`
- `Facebook Ad ID`
- `Ad Error`
- `Ad Uploaded At`
- `Ad Launched At`
- `Ad Last Synced At`
- `Ad Preview URL`

`Facebook Campaign` can be a relation to the `Facebook Campaigns` database for prefill. The final launch selection happens in the dashboard and is sent to Meta by Campaign ID + AdSet ID.

If your Notion field casing differs, override the `NOTION_PROP_*` variables.

## Asset Naming

Creative asset filenames are validated before upload. Use lowercase latin letters, numbers, underscores, and `&` only:

```text
monYY_vacancy_business_concept_format_vN_size
```

Examples:

```text
jan26_data_engin_ga_con1_stat_v1_1x1
jan26_data_engin_ga_con1_stat_v1_9x16
```

Accepted business tokens: `ga`, `ug`, `wisey`, `forma`, `ruut`, `sg`/`s&g`.
Accepted formats: `stat` for images, `video` for videos.

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

Campaigns are synced from Meta into the Notion `Facebook Campaigns` database through:

```text
POST /api/campaigns/sync
```

Launch behavior:

- The dashboard reads live Campaigns from Meta.
- After a Campaign is selected, the dashboard reads that Campaign's existing AdSets from Meta.
- Launch creates the ad in the selected AdSet ID. The backend validates that the selected AdSet belongs to the selected Campaign.
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
