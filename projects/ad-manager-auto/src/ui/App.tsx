import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  ExternalLink,
  ImageIcon,
  Loader2,
  LogOut,
  Megaphone,
  Plus,
  Play,
  RefreshCw,
  Save,
  X
} from "lucide-react";
import { type Dispatch, type FormEvent, type SetStateAction, useCallback, useEffect, useMemo, useState } from "react";
import { getOktaAuth, isAuthDisabled } from "./auth";
import {
  AdDraftPayload,
  AdDraftWithCreative,
  AdSetDraftPayload,
  AdSetDraftWithAds,
  CampaignDraft,
  CampaignDraftPayload,
  CampaignDraftTree,
  Creative,
  CreativeListKind,
  LaunchRequest,
  MetaAdSet,
  MetaCampaign,
  createAdDraft,
  createAdSetDraft,
  createCampaignDraft,
  fetchAdSets,
  fetchCampaignDraft,
  fetchCampaignDrafts,
  fetchCampaigns,
  fetchCreatives,
  launchCreative,
  syncCampaigns,
  updateAdDraft,
  updateAdSetDraft,
  updateCampaignDraft
} from "./api";

type CreativeView = "dashboard" | "needs-details" | "upload-failed" | "launched";
type RouteState =
  | {
      area: "creatives";
      view: CreativeView;
    }
  | {
      area: "campaigns";
      campaignId?: number;
    };

type CampaignFormState = {
  name: string;
  objective: string;
  buyingType: string;
  campaignSettingsMode: string;
  budgetStrategy: string;
  campaignDailyBudgetMinor: string;
  campaignLifetimeBudgetMinor: string;
  bidStrategy: string;
  spendCapMinor: string;
  specialAdCategories: string;
  specialAdCategoryCountries: string;
  promotedObject: string;
  budgetScheduleSpecs: string;
  isSkadnetworkAttribution: boolean;
  abTestEnabled: boolean;
  liveAdsEnabled: boolean;
  metaStatus: string;
};

type AdSetFormState = {
  name: string;
  destinationType: string;
  conversionEvent: string;
  optimizationGoal: string;
  billingEvent: string;
  bidStrategy: string;
  bidAmountMinor: string;
  dailyBudgetMinor: string;
  lifetimeBudgetMinor: string;
  startTime: string;
  endTime: string;
  attributionSetting: string;
  isDynamicCreative: boolean;
  useAdvantageAudience: boolean;
  savedAudienceId: string;
  targeting: string;
  promotedObject: string;
  audienceControls: string;
  audienceRecommendations: string;
  placementMode: string;
  placementSettings: string;
  brandSafetyControls: string;
  pacingType: string;
  adsetSchedule: string;
  frequencyControlSpecs: string;
  beneficiary: string;
  payor: string;
  metaStatus: string;
};

const campaignObjectives = [
  "OUTCOME_TRAFFIC",
  "OUTCOME_ENGAGEMENT",
  "OUTCOME_LEADS",
  "OUTCOME_SALES",
  "OUTCOME_AWARENESS",
  "OUTCOME_APP_PROMOTION"
];
const buyingTypes = ["AUCTION", "RESERVED"];
const metaStatuses = ["PAUSED", "ACTIVE"];
const campaignSettingsModes = [
  { value: "MANUAL", label: "Manual campaign setup" },
  { value: "RECOMMENDED", label: "Recommended Meta settings" }
];
const budgetStrategies = [
  { value: "AD_SET", label: "Ad set budget" },
  { value: "CAMPAIGN", label: "Campaign budget" }
];
const bidStrategies = ["", "LOWEST_COST_WITHOUT_CAP", "LOWEST_COST_WITH_BID_CAP", "COST_CAP", "LOWEST_COST_WITH_MIN_ROAS"];
const destinationTypes = [
  "WEBSITE",
  "APP",
  "MESSENGER",
  "WHATSAPP",
  "INSTAGRAM_DIRECT",
  "ON_AD",
  "PHONE_CALL",
  "APP_STORE",
  "DEEPLINK"
];
const conversionEvents = [
  "",
  "LINK_CLICK",
  "LANDING_PAGE_VIEW",
  "LEAD",
  "PURCHASE",
  "CONTACT",
  "SUBSCRIBE",
  "COMPLETE_REGISTRATION",
  "INITIATED_CHECKOUT",
  "ADD_TO_CART",
  "APP_INSTALL"
];
const optimizationGoals = [
  "LINK_CLICKS",
  "LANDING_PAGE_VIEWS",
  "OFFSITE_CONVERSIONS",
  "LEAD_GENERATION",
  "CONVERSATIONS",
  "IMPRESSIONS",
  "REACH",
  "POST_ENGAGEMENT",
  "THRUPLAY",
  "VALUE",
  "APP_INSTALLS"
];
const billingEvents = ["IMPRESSIONS", "LINK_CLICKS", "THRUPLAY", "APP_INSTALLS", "POST_ENGAGEMENT"];
const attributionSettings = ["", "1d_click", "7d_click", "1d_view", "1d_click_1d_view", "7d_click_1d_view", "skan_click", "skan_view"];
const placementModes = [
  { value: "ADVANTAGE_PLUS", label: "Advantage+ placements" },
  { value: "MANUAL", label: "Manual placements" }
];
const pacingTypes = ["", "standard", "day_parting", "no_pacing"];
const ctaTypes = ["LEARN_MORE", "SIGN_UP", "SHOP_NOW", "APPLY_NOW", "CONTACT_US", "SUBSCRIBE", "DOWNLOAD", "GET_QUOTE"];

const viewConfig: Record<
  CreativeView,
  {
    title: string;
    navLabel: string;
    listKind: CreativeListKind;
    path: string;
    summary: string;
    empty: string;
  }
> = {
  dashboard: {
    title: "Ready to launch",
    navLabel: "Ready",
    listKind: "ready",
    path: "/dashboard",
    summary: "creatives ready",
    empty: "No creatives ready to launch yet."
  },
  "needs-details": {
    title: "Needs details",
    navLabel: "Needs details",
    listKind: "needs_ad_details",
    path: "/needs-details",
    summary: "creatives blocked",
    empty: "No creatives are waiting on ad details."
  },
  "upload-failed": {
    title: "Upload failed",
    navLabel: "Upload failed",
    listKind: "upload_failed",
    path: "/upload-failed",
    summary: "upload failures",
    empty: "No upload failures right now."
  },
  launched: {
    title: "Launched",
    navLabel: "Launched",
    listKind: "launched",
    path: "/launched",
    summary: "ads launched",
    empty: "No launched ads yet."
  }
};

const creativeNavItems = Object.keys(viewConfig) as CreativeView[];

function activeRoute(): RouteState {
  const campaignMatch = window.location.pathname.match(/^\/(?:campaigns|builder)(?:\/(\d+))?/);
  if (campaignMatch) {
    return {
      area: "campaigns",
      campaignId: campaignMatch[1] ? Number(campaignMatch[1]) : undefined
    };
  }
  if (window.location.pathname.includes("needs-details")) return { area: "creatives", view: "needs-details" };
  if (window.location.pathname.includes("upload-failed")) return { area: "creatives", view: "upload-failed" };
  return window.location.pathname.includes("launched")
    ? { area: "creatives", view: "launched" }
    : { area: "creatives", view: "dashboard" };
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function toDatetimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function nullableDatetimeLocal(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function optionalText(value: string) {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function nullablePositiveNumber(value: string, label: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive whole number.`);
  }
  return parsed;
}

function parseJsonObject(value: string, label: string): Record<string, unknown> {
  const parsed = JSON.parse(value.trim() || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function parseOptionalJsonObject(value: string, label: string) {
  if (!value.trim()) return null;
  return parseJsonObject(value, label);
}

function parseOptionalJsonValue(value: string, label: string): Record<string, unknown> | Array<Record<string, unknown>> | null {
  if (!value.trim()) return null;
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`${label} must be a JSON object or an array of objects.`);
  }
  if (Array.isArray(parsed)) {
    if (parsed.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
      throw new Error(`${label} must be an array of JSON objects.`);
    }
    return parsed as Array<Record<string, unknown>>;
  }
  return parsed as Record<string, unknown>;
}

function parseCategories(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatJsonValue(value?: unknown | null) {
  return value == null ? "" : JSON.stringify(value, null, 2);
}

function formatCategories(categories?: string[] | null) {
  return categories?.join(", ") ?? "";
}

function defaultCampaignFormState(): CampaignFormState {
  return {
    name: "",
    objective: "OUTCOME_TRAFFIC",
    buyingType: "AUCTION",
    campaignSettingsMode: "MANUAL",
    budgetStrategy: "AD_SET",
    campaignDailyBudgetMinor: "",
    campaignLifetimeBudgetMinor: "",
    bidStrategy: "",
    spendCapMinor: "",
    specialAdCategories: "",
    specialAdCategoryCountries: "",
    promotedObject: "",
    budgetScheduleSpecs: "",
    isSkadnetworkAttribution: false,
    abTestEnabled: false,
    liveAdsEnabled: false,
    metaStatus: "PAUSED"
  };
}

function campaignToFormState(campaign: CampaignDraftTree): CampaignFormState {
  return {
    name: campaign.name,
    objective: campaign.objective,
    buyingType: campaign.buying_type,
    campaignSettingsMode: campaign.campaign_settings_mode || "MANUAL",
    budgetStrategy: campaign.budget_strategy || "AD_SET",
    campaignDailyBudgetMinor: campaign.campaign_daily_budget_minor?.toString() ?? "",
    campaignLifetimeBudgetMinor: campaign.campaign_lifetime_budget_minor?.toString() ?? "",
    bidStrategy: campaign.bid_strategy ?? "",
    spendCapMinor: campaign.spend_cap_minor?.toString() ?? "",
    specialAdCategories: formatCategories(campaign.special_ad_categories),
    specialAdCategoryCountries: formatCategories(campaign.special_ad_category_countries),
    promotedObject: formatJsonValue(campaign.promoted_object),
    budgetScheduleSpecs: formatJsonValue(campaign.budget_schedule_specs),
    isSkadnetworkAttribution: campaign.is_skadnetwork_attribution,
    abTestEnabled: campaign.a_b_test_enabled,
    liveAdsEnabled: campaign.live_ads_enabled,
    metaStatus: campaign.meta_status
  };
}

function buildCampaignPayload(draft: CampaignFormState): CampaignDraftPayload & { name: string } {
  const name = draft.name.trim();
  if (!name) {
    throw new Error("Campaign name is required.");
  }

  const campaignDailyBudgetMinor =
    draft.budgetStrategy === "CAMPAIGN" ? nullablePositiveNumber(draft.campaignDailyBudgetMinor, "Campaign daily budget") : null;
  const campaignLifetimeBudgetMinor =
    draft.budgetStrategy === "CAMPAIGN"
      ? nullablePositiveNumber(draft.campaignLifetimeBudgetMinor, "Campaign lifetime budget")
      : null;

  if (campaignDailyBudgetMinor && campaignLifetimeBudgetMinor) {
    throw new Error("Use either campaign daily budget or campaign lifetime budget, not both.");
  }

  if (draft.budgetStrategy === "CAMPAIGN" && !campaignDailyBudgetMinor && !campaignLifetimeBudgetMinor) {
    throw new Error("Campaign budget strategy needs a daily or lifetime campaign budget.");
  }

  return {
    name,
    objective: draft.objective,
    buyingType: draft.buyingType,
    campaignSettingsMode: draft.campaignSettingsMode,
    budgetStrategy: draft.budgetStrategy,
    campaignDailyBudgetMinor,
    campaignLifetimeBudgetMinor,
    bidStrategy: optionalText(draft.bidStrategy) ?? null,
    spendCapMinor: nullablePositiveNumber(draft.spendCapMinor, "Spend cap"),
    specialAdCategories: parseCategories(draft.specialAdCategories),
    specialAdCategoryCountries: parseCategories(draft.specialAdCategoryCountries),
    promotedObject: parseOptionalJsonObject(draft.promotedObject, "Promoted object"),
    budgetScheduleSpecs: parseOptionalJsonValue(draft.budgetScheduleSpecs, "Budget schedule specs"),
    isSkadnetworkAttribution: draft.isSkadnetworkAttribution,
    abTestEnabled: draft.abTestEnabled,
    liveAdsEnabled: draft.liveAdsEnabled,
    metaStatus: draft.metaStatus
  };
}

function adSetToFormState(adset: AdSetDraftWithAds): AdSetFormState {
  return {
    name: adset.name,
    destinationType: adset.destination_type || "WEBSITE",
    conversionEvent: adset.conversion_event ?? "",
    optimizationGoal: adset.optimization_goal || "LINK_CLICKS",
    billingEvent: adset.billing_event || "IMPRESSIONS",
    bidStrategy: adset.bid_strategy ?? "",
    bidAmountMinor: adset.bid_amount_minor?.toString() ?? "",
    dailyBudgetMinor: adset.daily_budget_minor?.toString() ?? "",
    lifetimeBudgetMinor: adset.lifetime_budget_minor?.toString() ?? "",
    startTime: toDatetimeLocal(adset.start_time),
    endTime: toDatetimeLocal(adset.end_time),
    attributionSetting: adset.attribution_setting ?? "",
    isDynamicCreative: adset.is_dynamic_creative,
    useAdvantageAudience: adset.use_advantage_audience,
    savedAudienceId: adset.saved_audience_id ?? "",
    targeting: JSON.stringify(adset.targeting ?? {}, null, 2),
    promotedObject: formatJsonValue(adset.promoted_object),
    audienceControls: JSON.stringify(adset.audience_controls ?? {}, null, 2),
    audienceRecommendations: JSON.stringify(adset.audience_recommendations ?? {}, null, 2),
    placementMode: adset.placement_mode || "ADVANTAGE_PLUS",
    placementSettings: JSON.stringify(adset.placement_settings ?? {}, null, 2),
    brandSafetyControls: JSON.stringify(adset.brand_safety_controls ?? {}, null, 2),
    pacingType: adset.pacing_type ?? "",
    adsetSchedule: formatJsonValue(adset.adset_schedule),
    frequencyControlSpecs: formatJsonValue(adset.frequency_control_specs),
    beneficiary: adset.beneficiary ?? "",
    payor: adset.payor ?? "",
    metaStatus: adset.meta_status || "PAUSED"
  };
}

function buildAdSetPayload(draft: AdSetFormState, campaignBudgetStrategy: string): AdSetDraftPayload & { name: string } {
  const name = draft.name.trim();
  if (!name) {
    throw new Error("Ad set name is required.");
  }

  const dailyBudgetMinor =
    campaignBudgetStrategy === "CAMPAIGN" ? null : nullablePositiveNumber(draft.dailyBudgetMinor, "Daily budget");
  const lifetimeBudgetMinor =
    campaignBudgetStrategy === "CAMPAIGN" ? null : nullablePositiveNumber(draft.lifetimeBudgetMinor, "Lifetime budget");

  if (dailyBudgetMinor && lifetimeBudgetMinor) {
    throw new Error("Use either ad set daily budget or lifetime budget, not both.");
  }

  if (campaignBudgetStrategy !== "CAMPAIGN" && !dailyBudgetMinor && !lifetimeBudgetMinor) {
    throw new Error("Ad set budget strategy needs a daily or lifetime budget.");
  }

  return {
    name,
    destinationType: draft.destinationType,
    conversionEvent: nullableText(draft.conversionEvent),
    optimizationGoal: draft.optimizationGoal,
    billingEvent: draft.billingEvent,
    bidStrategy: nullableText(draft.bidStrategy),
    bidAmountMinor: nullablePositiveNumber(draft.bidAmountMinor, "Bid amount"),
    dailyBudgetMinor,
    lifetimeBudgetMinor,
    startTime: nullableDatetimeLocal(draft.startTime),
    endTime: nullableDatetimeLocal(draft.endTime),
    targeting: parseJsonObject(draft.targeting, "Targeting"),
    promotedObject: parseOptionalJsonObject(draft.promotedObject, "Promoted object"),
    attributionSetting: nullableText(draft.attributionSetting),
    isDynamicCreative: draft.isDynamicCreative,
    useAdvantageAudience: draft.useAdvantageAudience,
    savedAudienceId: nullableText(draft.savedAudienceId),
    audienceControls: parseJsonObject(draft.audienceControls, "Audience controls"),
    audienceRecommendations: parseJsonObject(draft.audienceRecommendations, "Audience recommendations"),
    placementMode: draft.placementMode,
    placementSettings: parseJsonObject(draft.placementSettings, "Placement settings"),
    brandSafetyControls: parseJsonObject(draft.brandSafetyControls, "Brand safety controls"),
    pacingType: nullableText(draft.pacingType),
    adsetSchedule: parseOptionalJsonValue(draft.adsetSchedule, "Ad set schedule"),
    frequencyControlSpecs: parseOptionalJsonValue(draft.frequencyControlSpecs, "Frequency control specs"),
    beneficiary: nullableText(draft.beneficiary),
    payor: nullableText(draft.payor),
    metaStatus: draft.metaStatus
  };
}

function countAds(campaign: CampaignDraftTree) {
  return campaign.adsets.reduce((sum, adset) => sum + adset.ads.length, 0);
}

function CreativePreview({ creative }: { creative: Creative }) {
  if (creative.preview_url && creative.asset_type === "image") {
    return <img src={creative.preview_url} alt="" className="previewImage" />;
  }

  return (
    <div className="previewFallback">
      <span>{creative.asset_type ?? "asset"}</span>
    </div>
  );
}

function StatusChip({ value }: { value: string }) {
  return <span className={`statusChip ${value}`}>{value.replaceAll("_", " ")}</span>;
}

function MetadataItem({ label, value }: { label: string; value?: string | null }) {
  return (
    <span className="metadataItem">
      <small>{label}</small>
      <strong>{value || "—"}</strong>
    </span>
  );
}

function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="notice">
      <AlertCircle size={18} />
      {message}
    </div>
  );
}

function SuccessNotice({ message }: { message: string }) {
  return (
    <div className="notice success">
      <Check size={18} />
      {message}
    </div>
  );
}

function ConfirmModal({
  creative,
  loading,
  onClose,
  onConfirm
}: {
  creative: Creative;
  loading: boolean;
  onClose: () => void;
  onConfirm: (payload: LaunchRequest) => void;
}) {
  const [draft, setDraft] = useState({
    projectType: creative.project_type ?? "",
    adText: creative.ad_text ?? "",
    ctaLink: creative.cta_link ?? "",
    audience: creative.audience ?? "",
    location: creative.location ?? ""
  });
  const [campaigns, setCampaigns] = useState<MetaCampaign[]>([]);
  const [adSets, setAdSets] = useState<MetaAdSet[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [adSetId, setAdSetId] = useState("");
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [adSetsLoading, setAdSetsLoading] = useState(false);
  const [placementError, setPlacementError] = useState<string | null>(null);

  useEffect(() => {
    setDraft({
      projectType: creative.project_type ?? "",
      adText: creative.ad_text ?? "",
      ctaLink: creative.cta_link ?? "",
      audience: creative.audience ?? "",
      location: creative.location ?? ""
    });
  }, [creative]);

  useEffect(() => {
    let active = true;
    setCampaignId("");
    setAdSetId("");
    setCampaignsLoading(true);
    setPlacementError(null);

    fetchCampaigns()
      .then((items) => {
        if (!active) return;
        setCampaigns(items);
        if (creative.campaign_id && items.some((campaign) => campaign.id === creative.campaign_id)) {
          setCampaignId(creative.campaign_id);
          setAdSetId(creative.adset_id ?? "");
        }
      })
      .catch((error) => {
        if (!active) return;
        setPlacementError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setCampaignsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [creative]);

  useEffect(() => {
    if (!campaignId) {
      setAdSets([]);
      setAdSetId("");
      return;
    }

    let active = true;
    setAdSetsLoading(true);
    setPlacementError(null);

    fetchAdSets(campaignId)
      .then((items) => {
        if (!active) return;
        setAdSets(items);
        setAdSetId((current) => (items.some((item) => item.id === current) ? current : ""));
      })
      .catch((error) => {
        if (!active) return;
        setPlacementError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setAdSetsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [campaignId]);

  const selectedCampaign = campaigns.find((campaign) => campaign.id === campaignId);
  const selectedAdSet = adSets.find((adSet) => adSet.id === adSetId);
  const placementReady = Boolean(campaignId && adSetId);
  const detailsReady = Boolean(
    draft.projectType.trim() &&
      draft.adText.trim() &&
      draft.ctaLink.trim() &&
      draft.audience.trim() &&
      draft.location.trim()
  );

  function confirmPlacement() {
    if (!detailsReady) {
      setPlacementError("Fill in project type, ad text, CTA link, audience, and location before launch.");
      return;
    }

    if (!campaignId || !adSetId) {
      setPlacementError("Choose a campaign and ad set before launch.");
      return;
    }

    onConfirm({
      campaignId,
      campaignName: selectedCampaign?.name,
      adSetId,
      adSetName: selectedAdSet?.name,
      projectType: draft.projectType.trim(),
      adText: draft.adText.trim(),
      ctaLink: draft.ctaLink.trim(),
      audience: draft.audience.trim(),
      location: draft.location.trim()
    });
  }

  function updateDraft(field: keyof typeof draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setPlacementError(null);
  }

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modalHeader">
          <div>
            <p className="eyebrow">Confirm launch</p>
            <input
              className="modalTitleInput"
              aria-label="Project type"
              value={draft.projectType}
              onChange={(event) => updateDraft("projectType", event.target.value)}
              placeholder="Project type"
              disabled={loading}
            />
          </div>
          <button className="iconButton" onClick={onClose} aria-label="Close" disabled={loading}>
            ×
          </button>
        </div>

        <div className="modalGrid">
          <CreativePreview creative={creative} />
          <div className="detailsForm">
            <label className="fieldGroup">
              <span>Ad text</span>
              <textarea
                value={draft.adText}
                onChange={(event) => updateDraft("adText", event.target.value)}
                rows={3}
                disabled={loading}
              />
            </label>
            <label className="fieldGroup">
              <span>CTA link</span>
              <input
                type="url"
                value={draft.ctaLink}
                onChange={(event) => updateDraft("ctaLink", event.target.value)}
                disabled={loading}
              />
            </label>
            <label className="fieldGroup">
              <span>Audience</span>
              <textarea
                value={draft.audience}
                onChange={(event) => updateDraft("audience", event.target.value)}
                rows={2}
                disabled={loading}
              />
            </label>
            <label className="fieldGroup">
              <span>Location</span>
              <input
                value={draft.location}
                onChange={(event) => updateDraft("location", event.target.value)}
                disabled={loading}
              />
            </label>
          </div>
        </div>

        <div className="placementPanel">
          <label className="fieldGroup">
            <span>Campaign</span>
            <select
              value={campaignId}
              onChange={(event) => {
                setCampaignId(event.target.value);
                setAdSetId("");
              }}
              disabled={loading || campaignsLoading}
            >
              <option value="">{campaignsLoading ? "Loading campaigns..." : "Select campaign"}</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name} {campaign.status ? `(${campaign.status})` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="fieldGroup">
            <span>Ad set</span>
            <select
              value={adSetId}
              onChange={(event) => setAdSetId(event.target.value)}
              disabled={loading || adSetsLoading || !campaignId}
            >
              <option value="">
                {!campaignId ? "Select campaign first" : adSetsLoading ? "Loading ad sets..." : "Select ad set"}
              </option>
              {adSets.map((adSet) => (
                <option key={adSet.id} value={adSet.id}>
                  {adSet.name} {adSet.effective_status || adSet.status ? `(${adSet.effective_status ?? adSet.status})` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        {placementError ? (
          <div className="modalNotice">
            <AlertCircle size={16} />
            {placementError}
          </div>
        ) : null}

        <div className="modalActions">
          {creative.notion_task_url ? (
            <a className="secondaryButton" href={creative.notion_task_url} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              Edit in Notion
            </a>
          ) : null}
          <button className="secondaryButton" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="primaryButton"
            onClick={confirmPlacement}
            disabled={loading || campaignsLoading || adSetsLoading || !placementReady || !detailsReady}
          >
            {loading ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
            Launch
          </button>
        </div>
      </div>
    </div>
  );
}

function CreativeRow({ creative, onLaunch }: { creative: Creative; onLaunch?: (creative: Creative) => void }) {
  const creativeName = creative.source_file_name ?? creative.project_type ?? `Creative ${creative.id}`;
  const hasPlacement = Boolean(creative.campaign_id || creative.adset_id || creative.campaign_name || creative.adset_name);

  return (
    <article className="creativeRow">
      <CreativePreview creative={creative} />
      <div className="creativeMain">
        <div className="creativeKicker">
          <span>Creative #{creative.id}</span>
          <span>{creative.asset_type ?? "asset"}</span>
        </div>
        <div className="creativeTitleLine">
          <h3>{creativeName}</h3>
          <StatusChip value={creative.status} />
        </div>
        {creative.project_type && creative.project_type !== creativeName ? (
          <p className="creativeFileName">{creative.project_type}</p>
        ) : null}
        <p className="adText">{creative.ad_text || "No primary text yet."}</p>
        <div className="creativeMetaGrid">
          <MetadataItem label="CTA" value={creative.cta_link} />
          <MetadataItem label="Audience" value={creative.audience} />
          <MetadataItem label="Location" value={creative.location} />
          <MetadataItem label="Updated" value={formatDate(creative.uploaded_at ?? creative.updated_at)} />
        </div>
      </div>
      <div className="creativeContext">
        <div className={hasPlacement ? "placementSummary" : "placementSummary muted"}>
          <span>Placement</span>
          <strong>{creative.campaign_name ?? creative.campaign_id ?? "No campaign"}</strong>
          <small>{creative.adset_name ?? creative.adset_id ?? "No ad set"}</small>
        </div>
        <div className="rowActions">
          {creative.notion_task_url ? (
            <a className="iconButton" href={creative.notion_task_url} target="_blank" rel="noreferrer" aria-label="Open Notion">
              <ExternalLink size={18} />
            </a>
          ) : null}
          {onLaunch ? (
            <button className="primaryButton compact" onClick={() => onLaunch(creative)}>
              <Play size={16} />
              Launch
            </button>
          ) : creative.status === "launched" ? (
            <span className="stateIcon success" aria-label="Launched">
              <Check size={18} />
            </span>
          ) : (
            <span className="stateIcon warning" aria-label="Needs attention">
              <AlertCircle size={18} />
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function CampaignFieldGroups({
  draft,
  setDraft,
  disabled,
  autoFocusName = false
}: {
  draft: CampaignFormState;
  setDraft: Dispatch<SetStateAction<CampaignFormState>>;
  disabled: boolean;
  autoFocusName?: boolean;
}) {
  const update = <Key extends keyof CampaignFormState>(field: Key, value: CampaignFormState[Key]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  return (
    <div className="campaignFieldStack">
      <section className="formSubsection">
        <div className="subsectionHeader">
          <h3>Campaign basics</h3>
        </div>
        <div className="formGrid two">
          <label className="fieldGroup wideField">
            <span>Campaign name</span>
            <input
              value={draft.name}
              onChange={(event) => update("name", event.target.value)}
              disabled={disabled}
              autoFocus={autoFocusName}
            />
          </label>
          <label className="fieldGroup">
            <span>Meta status</span>
            <select value={draft.metaStatus} onChange={(event) => update("metaStatus", event.target.value)} disabled={disabled}>
              {metaStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="fieldGroup">
            <span>Objective</span>
            <select value={draft.objective} onChange={(event) => update("objective", event.target.value)} disabled={disabled}>
              {campaignObjectives.map((objective) => (
                <option key={objective} value={objective}>
                  {objective}
                </option>
              ))}
            </select>
          </label>
          <label className="fieldGroup">
            <span>Buying type</span>
            <select value={draft.buyingType} onChange={(event) => update("buyingType", event.target.value)} disabled={disabled}>
              {buyingTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="fieldGroup">
            <span>Setup mode</span>
            <select
              value={draft.campaignSettingsMode}
              onChange={(event) => update("campaignSettingsMode", event.target.value)}
              disabled={disabled}
            >
              {campaignSettingsModes.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>
          <label className="fieldGroup">
            <span>Budget strategy</span>
            <select value={draft.budgetStrategy} onChange={(event) => update("budgetStrategy", event.target.value)} disabled={disabled}>
              {budgetStrategies.map((strategy) => (
                <option key={strategy.value} value={strategy.value}>
                  {strategy.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="formSubsection">
        <div className="subsectionHeader">
          <h3>Campaign budget</h3>
          <span>{draft.budgetStrategy === "CAMPAIGN" ? "Used at campaign level" : "Budget will be set per ad set"}</span>
        </div>
        <div className="formGrid three">
          <label className="fieldGroup">
            <span>Campaign daily budget minor</span>
            <input
              type="number"
              min="1"
              value={draft.campaignDailyBudgetMinor}
              onChange={(event) => update("campaignDailyBudgetMinor", event.target.value)}
              disabled={disabled || draft.budgetStrategy !== "CAMPAIGN"}
            />
          </label>
          <label className="fieldGroup">
            <span>Campaign lifetime budget minor</span>
            <input
              type="number"
              min="1"
              value={draft.campaignLifetimeBudgetMinor}
              onChange={(event) => update("campaignLifetimeBudgetMinor", event.target.value)}
              disabled={disabled || draft.budgetStrategy !== "CAMPAIGN"}
            />
          </label>
          <label className="fieldGroup">
            <span>Spend cap minor</span>
            <input
              type="number"
              min="1"
              value={draft.spendCapMinor}
              onChange={(event) => update("spendCapMinor", event.target.value)}
              disabled={disabled}
            />
          </label>
          <label className="fieldGroup">
            <span>Campaign bid strategy</span>
            <select value={draft.bidStrategy} onChange={(event) => update("bidStrategy", event.target.value)} disabled={disabled}>
              {bidStrategies.map((strategy) => (
                <option key={strategy || "default"} value={strategy}>
                  {strategy || "Meta default"}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="formSubsection">
        <div className="subsectionHeader">
          <h3>Compliance</h3>
        </div>
        <div className="formGrid two">
          <label className="fieldGroup">
            <span>Special ad categories</span>
            <input
              value={draft.specialAdCategories}
              onChange={(event) => update("specialAdCategories", event.target.value)}
              placeholder="HOUSING, EMPLOYMENT, CREDIT, ISSUES_ELECTIONS_POLITICS"
              disabled={disabled}
            />
          </label>
          <label className="fieldGroup">
            <span>Special ad category countries</span>
            <input
              value={draft.specialAdCategoryCountries}
              onChange={(event) => update("specialAdCategoryCountries", event.target.value)}
              placeholder="US, UA, PL"
              disabled={disabled}
            />
          </label>
        </div>
        <div className="toggleGrid">
          <label className="checkboxField">
            <input
              type="checkbox"
              checked={draft.isSkadnetworkAttribution}
              onChange={(event) => update("isSkadnetworkAttribution", event.target.checked)}
              disabled={disabled}
            />
            <span>SKAdNetwork attribution campaign</span>
          </label>
          <label className="checkboxField">
            <input
              type="checkbox"
              checked={draft.abTestEnabled}
              onChange={(event) => update("abTestEnabled", event.target.checked)}
              disabled={disabled}
            />
            <span>A/B testing enabled</span>
          </label>
          <label className="checkboxField">
            <input
              type="checkbox"
              checked={draft.liveAdsEnabled}
              onChange={(event) => update("liveAdsEnabled", event.target.checked)}
              disabled={disabled}
            />
            <span>Live ads campaign</span>
          </label>
        </div>
      </section>

      <section className="formSubsection">
        <div className="subsectionHeader">
          <h3>Advanced campaign payload</h3>
          <span>Promoted object and schedule</span>
        </div>
        <label className="fieldGroup">
          <span>Promoted object JSON</span>
          <textarea
            className="codeTextarea"
            value={draft.promotedObject}
            onChange={(event) => update("promotedObject", event.target.value)}
            placeholder='{"pixel_id":"...", "custom_event_type":"LEAD"}'
            rows={4}
            disabled={disabled}
          />
        </label>
        <label className="fieldGroup">
          <span>Budget schedule specs JSON</span>
          <textarea
            className="codeTextarea"
            value={draft.budgetScheduleSpecs}
            onChange={(event) => update("budgetScheduleSpecs", event.target.value)}
            placeholder='[{"time_start":1699081200,"time_end":1699167600,"budget_value":100,"budget_value_type":"ABSOLUTE"}]'
            rows={4}
            disabled={disabled}
          />
        </label>
      </section>
    </div>
  );
}

function CampaignCreateModal({
  loading,
  onClose,
  onSubmit
}: {
  loading: boolean;
  onClose: () => void;
  onSubmit: (payload: CampaignDraftPayload & { name: string }) => void;
}) {
  const [draft, setDraft] = useState<CampaignFormState>(defaultCampaignFormState());
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      setError(null);
      onSubmit(buildCampaignPayload(draft));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    }
  }

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true">
      <form className="modal campaignModal" onSubmit={submit}>
        <div className="modalHeader">
          <div>
            <p className="eyebrow">New campaign draft</p>
            <h2>Create campaign</h2>
          </div>
          <button type="button" className="iconButton" onClick={onClose} aria-label="Close" disabled={loading}>
            <X size={18} />
          </button>
        </div>

        <CampaignFieldGroups draft={draft} setDraft={setDraft} disabled={loading} autoFocusName />

        {error ? (
          <div className="modalNotice">
            <AlertCircle size={16} />
            {error}
          </div>
        ) : null}

        <div className="modalActions">
          <button type="button" className="secondaryButton" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="primaryButton" disabled={loading}>
            {loading ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
            Create campaign
          </button>
        </div>
      </form>
    </div>
  );
}

function CampaignDraftListView({ ready, onOpen }: { ready: boolean; onOpen: (id: number) => void }) {
  const [drafts, setDrafts] = useState<CampaignDraft[]>([]);
  const [adSetCounts, setAdSetCounts] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const items = await fetchCampaignDrafts();
      setDrafts(items);
      const detailPairs = await Promise.all(
        items.map(async (draft) => {
          try {
            const detail = await fetchCampaignDraft(draft.id);
            return [draft.id, detail.adsets.length] as const;
          } catch {
            return [draft.id, 0] as const;
          }
        })
      );
      setAdSetCounts(Object.fromEntries(detailPairs));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [ready]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitCampaign(payload: CampaignDraftPayload & { name: string }) {
    setCreating(true);
    setError(null);
    try {
      const campaign = await createCampaignDraft(payload);
      setCreateOpen(false);
      onOpen(campaign.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="content">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Campaign Builder</p>
          <h1>Campaign drafts</h1>
        </div>
        <div className="headerActions">
          <button className="secondaryButton" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? "spin" : ""} />
            Refresh
          </button>
          <button className="primaryButton" onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            Create campaign
          </button>
        </div>
      </header>

      <section className="summaryBand">
        <div>
          <span>{drafts.length}</span>
          <p>campaign drafts</p>
        </div>
        <div>
          <span>{drafts.filter((draft) => draft.status === "draft").length}</span>
          <p>open drafts</p>
        </div>
        <div>
          <span>Meta</span>
          <p>Publish flow coming next</p>
        </div>
      </section>

      {error ? <ErrorNotice message={error} /> : null}

      <section className="campaignTable">
        <div className="campaignTableHeader campaignTableGrid">
          <span>Name</span>
          <span>Objective</span>
          <span>Status</span>
          <span>Ad sets</span>
          <span>Updated</span>
        </div>
        {loading ? (
          <div className="emptyState">
            <Loader2 className="spin" />
            Loading campaign drafts
          </div>
        ) : drafts.length === 0 ? (
          <div className="emptyState">
            <Megaphone size={28} />
            No campaign drafts yet.
          </div>
        ) : (
          drafts.map((draft) => (
            <button key={draft.id} className="campaignTableRow campaignTableGrid" onClick={() => onOpen(draft.id)}>
              <strong>{draft.name}</strong>
              <span>{draft.objective}</span>
              <span>
                <StatusChip value={draft.status} />
              </span>
              <span>{adSetCounts[draft.id] ?? 0}</span>
              <span>{formatDate(draft.updated_at)}</span>
            </button>
          ))
        )}
      </section>

      {createOpen ? (
        <CampaignCreateModal loading={creating} onClose={() => setCreateOpen(false)} onSubmit={submitCampaign} />
      ) : null}
    </main>
  );
}

function CampaignSettingsForm({
  campaign,
  saving,
  onSave,
  onError
}: {
  campaign: CampaignDraftTree;
  saving: boolean;
  onSave: (payload: CampaignDraftPayload) => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState<CampaignFormState>(() => campaignToFormState(campaign));

  useEffect(() => {
    setDraft(campaignToFormState(campaign));
  }, [campaign]);

  function save() {
    try {
      onSave(buildCampaignPayload(draft));
    } catch (saveError) {
      onError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  }

  return (
    <section className="builderSection">
      <div className="sectionHeader">
        <div>
          <p className="eyebrow">Campaign</p>
          <h2>Settings</h2>
        </div>
        <div className="headerActions">
          <StatusChip value={campaign.status} />
          <button className="primaryButton" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            Save campaign
          </button>
        </div>
      </div>
      <CampaignFieldGroups draft={draft} setDraft={setDraft} disabled={saving} />
    </section>
  );
}

function AdDraftEditor({
  ad,
  saving,
  onSave,
  onError
}: {
  ad: AdDraftWithCreative;
  saving: boolean;
  onSave: (id: number, payload: AdDraftPayload) => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState({
    name: ad.name ?? "",
    primaryText: ad.primary_text ?? "",
    headline: ad.headline ?? "",
    description: ad.description ?? "",
    ctaType: ad.cta_type || "LEARN_MORE",
    ctaLink: ad.cta_link ?? "",
    displayLink: ad.display_link ?? "",
    urlTags: ad.url_tags ?? "",
    metaStatus: ad.meta_status || "PAUSED"
  });

  useEffect(() => {
    setDraft({
      name: ad.name ?? "",
      primaryText: ad.primary_text ?? "",
      headline: ad.headline ?? "",
      description: ad.description ?? "",
      ctaType: ad.cta_type || "LEARN_MORE",
      ctaLink: ad.cta_link ?? "",
      displayLink: ad.display_link ?? "",
      urlTags: ad.url_tags ?? "",
      metaStatus: ad.meta_status || "PAUSED"
    });
  }, [ad]);

  function save() {
    if (!draft.name.trim()) {
      onError("Ad name is required.");
      return;
    }
    onSave(ad.id, {
      name: draft.name.trim(),
      primaryText: optionalText(draft.primaryText),
      headline: optionalText(draft.headline),
      description: optionalText(draft.description),
      ctaType: draft.ctaType,
      ctaLink: optionalText(draft.ctaLink),
      displayLink: optionalText(draft.displayLink),
      urlTags: optionalText(draft.urlTags),
      metaStatus: draft.metaStatus
    });
  }

  return (
    <article className="adDraftEditor">
      <div className="adDraftPreview">
        <CreativePreview creative={ad.creative} />
        <div>
          <strong>{ad.creative.source_file_name ?? `Creative ${ad.creative.id}`}</strong>
          <span>{ad.creative.asset_type ?? "asset"}</span>
        </div>
      </div>
      <div className="adDraftFields">
        <div className="sectionHeader compact">
          <div>
            <p className="eyebrow">Ad draft</p>
            <h3>{draft.name || "Untitled ad"}</h3>
          </div>
          <div className="headerActions">
            <StatusChip value={ad.status} />
            <button className="secondaryButton" onClick={save} disabled={saving}>
              {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              Save ad
            </button>
          </div>
        </div>
        <div className="formGrid two">
          <label className="fieldGroup">
            <span>Name</span>
            <input
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              disabled={saving}
            />
          </label>
          <label className="fieldGroup">
            <span>CTA type</span>
            <select
              value={draft.ctaType}
              onChange={(event) => setDraft((current) => ({ ...current, ctaType: event.target.value }))}
              disabled={saving}
            >
              {ctaTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="fieldGroup">
          <span>Primary text</span>
          <textarea
            value={draft.primaryText}
            onChange={(event) => setDraft((current) => ({ ...current, primaryText: event.target.value }))}
            rows={3}
            disabled={saving}
          />
        </label>
        <div className="formGrid two">
          <label className="fieldGroup">
            <span>Headline</span>
            <input
              value={draft.headline}
              onChange={(event) => setDraft((current) => ({ ...current, headline: event.target.value }))}
              disabled={saving}
            />
          </label>
          <label className="fieldGroup">
            <span>Description</span>
            <input
              value={draft.description}
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
              disabled={saving}
            />
          </label>
          <label className="fieldGroup">
            <span>CTA link</span>
            <input
              type="url"
              value={draft.ctaLink}
              onChange={(event) => setDraft((current) => ({ ...current, ctaLink: event.target.value }))}
              disabled={saving}
            />
          </label>
          <label className="fieldGroup">
            <span>Display link</span>
            <input
              value={draft.displayLink}
              onChange={(event) => setDraft((current) => ({ ...current, displayLink: event.target.value }))}
              disabled={saving}
            />
          </label>
          <label className="fieldGroup">
            <span>URL tags</span>
            <input
              value={draft.urlTags}
              onChange={(event) => setDraft((current) => ({ ...current, urlTags: event.target.value }))}
              disabled={saving}
            />
          </label>
          <label className="fieldGroup">
            <span>Meta status</span>
            <select
              value={draft.metaStatus}
              onChange={(event) => setDraft((current) => ({ ...current, metaStatus: event.target.value }))}
              disabled={saving}
            >
              {metaStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </article>
  );
}

function AdSetEditor({
  adset,
  campaignBudgetStrategy,
  saving,
  onSave,
  onAddCreative,
  onSaveAd,
  onError
}: {
  adset: AdSetDraftWithAds;
  campaignBudgetStrategy: string;
  saving: string | null;
  onSave: (id: number, payload: AdSetDraftPayload) => void;
  onAddCreative: (adsetId: number) => void;
  onSaveAd: (id: number, payload: AdDraftPayload) => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState<AdSetFormState>(() => adSetToFormState(adset));

  useEffect(() => {
    setDraft(adSetToFormState(adset));
  }, [adset]);

  const update = <Key extends keyof AdSetFormState>(field: Key, value: AdSetFormState[Key]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  function save() {
    try {
      onSave(adset.id, buildAdSetPayload(draft, campaignBudgetStrategy));
    } catch (saveError) {
      onError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  }

  const adSetSaving = saving === `adset-${adset.id}`;
  const usesCampaignBudget = campaignBudgetStrategy === "CAMPAIGN";

  return (
    <section className="adsetEditor">
      <div className="sectionHeader">
        <div>
          <p className="eyebrow">Ad set draft</p>
          <h2>{adset.name}</h2>
        </div>
        <div className="headerActions">
          <StatusChip value={adset.status} />
          <button className="secondaryButton" onClick={() => onAddCreative(adset.id)}>
            <ImageIcon size={16} />
            Add creative
          </button>
          <button className="primaryButton" onClick={save} disabled={adSetSaving}>
            {adSetSaving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            Save ad set
          </button>
        </div>
      </div>

      <div className="campaignFieldStack">
        <section className="formSubsection">
          <div className="subsectionHeader">
            <h3>Delivery and conversion</h3>
          </div>
          <div className="formGrid three">
            <label className="fieldGroup wideField">
              <span>Ad set name</span>
              <input value={draft.name} onChange={(event) => update("name", event.target.value)} disabled={adSetSaving} />
            </label>
            <label className="fieldGroup">
              <span>Meta status</span>
              <select value={draft.metaStatus} onChange={(event) => update("metaStatus", event.target.value)} disabled={adSetSaving}>
                {metaStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label className="fieldGroup">
              <span>Conversion location</span>
              <select
                value={draft.destinationType}
                onChange={(event) => update("destinationType", event.target.value)}
                disabled={adSetSaving}
              >
                {destinationTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label className="fieldGroup">
              <span>Conversion event</span>
              <select
                value={draft.conversionEvent}
                onChange={(event) => update("conversionEvent", event.target.value)}
                disabled={adSetSaving}
              >
                {conversionEvents.map((event) => (
                  <option key={event || "default"} value={event}>
                    {event || "Meta default"}
                  </option>
                ))}
              </select>
            </label>
            <label className="fieldGroup">
              <span>Optimization goal</span>
              <select
                value={draft.optimizationGoal}
                onChange={(event) => update("optimizationGoal", event.target.value)}
                disabled={adSetSaving}
              >
                {optimizationGoals.map((goal) => (
                  <option key={goal} value={goal}>
                    {goal}
                  </option>
                ))}
              </select>
            </label>
            <label className="fieldGroup">
              <span>Billing event</span>
              <select value={draft.billingEvent} onChange={(event) => update("billingEvent", event.target.value)} disabled={adSetSaving}>
                {billingEvents.map((event) => (
                  <option key={event} value={event}>
                    {event}
                  </option>
                ))}
              </select>
            </label>
            <label className="fieldGroup">
              <span>Attribution setting</span>
              <select
                value={draft.attributionSetting}
                onChange={(event) => update("attributionSetting", event.target.value)}
                disabled={adSetSaving}
              >
                {attributionSettings.map((setting) => (
                  <option key={setting || "default"} value={setting}>
                    {setting || "Meta default"}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="formSubsection">
          <div className="subsectionHeader">
            <h3>Budget and schedule</h3>
            <span>{usesCampaignBudget ? "Campaign budget is active" : "Ad set budget required"}</span>
          </div>
          <div className="formGrid three">
            <label className="fieldGroup">
              <span>Daily budget minor</span>
              <input
                type="number"
                min="1"
                value={draft.dailyBudgetMinor}
                onChange={(event) => update("dailyBudgetMinor", event.target.value)}
                disabled={adSetSaving || usesCampaignBudget}
              />
            </label>
            <label className="fieldGroup">
              <span>Lifetime budget minor</span>
              <input
                type="number"
                min="1"
                value={draft.lifetimeBudgetMinor}
                onChange={(event) => update("lifetimeBudgetMinor", event.target.value)}
                disabled={adSetSaving || usesCampaignBudget}
              />
            </label>
            <label className="fieldGroup">
              <span>Bid strategy</span>
              <select value={draft.bidStrategy} onChange={(event) => update("bidStrategy", event.target.value)} disabled={adSetSaving}>
                {bidStrategies.map((strategy) => (
                  <option key={strategy || "default"} value={strategy}>
                    {strategy || "Meta default"}
                  </option>
                ))}
              </select>
            </label>
            <label className="fieldGroup">
              <span>Bid amount minor</span>
              <input
                type="number"
                min="1"
                value={draft.bidAmountMinor}
                onChange={(event) => update("bidAmountMinor", event.target.value)}
                disabled={adSetSaving}
              />
            </label>
            <label className="fieldGroup">
              <span>Start time</span>
              <input
                type="datetime-local"
                value={draft.startTime}
                onChange={(event) => update("startTime", event.target.value)}
                disabled={adSetSaving}
              />
            </label>
            <label className="fieldGroup">
              <span>End time</span>
              <input
                type="datetime-local"
                value={draft.endTime}
                onChange={(event) => update("endTime", event.target.value)}
                disabled={adSetSaving}
              />
            </label>
            <label className="fieldGroup">
              <span>Pacing type</span>
              <select value={draft.pacingType} onChange={(event) => update("pacingType", event.target.value)} disabled={adSetSaving}>
                {pacingTypes.map((type) => (
                  <option key={type || "default"} value={type}>
                    {type || "Meta default"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="checkboxField">
            <input
              type="checkbox"
              checked={draft.isDynamicCreative}
              onChange={(event) => update("isDynamicCreative", event.target.checked)}
              disabled={adSetSaving}
            />
            <span>Dynamic creative</span>
          </label>
        </section>

        <section className="formSubsection">
          <div className="subsectionHeader">
            <h3>Audience</h3>
            <span>Targeting remains JSON for MVP</span>
          </div>
          <div className="formGrid two">
            <label className="checkboxField">
              <input
                type="checkbox"
                checked={draft.useAdvantageAudience}
                onChange={(event) => update("useAdvantageAudience", event.target.checked)}
                disabled={adSetSaving}
              />
              <span>Use Advantage+ audience</span>
            </label>
            <label className="fieldGroup">
              <span>Saved audience ID</span>
              <input
                value={draft.savedAudienceId}
                onChange={(event) => update("savedAudienceId", event.target.value)}
                disabled={adSetSaving}
              />
            </label>
          </div>
          <label className="fieldGroup">
            <span>Targeting JSON</span>
            <textarea
              className="codeTextarea"
              value={draft.targeting}
              onChange={(event) => update("targeting", event.target.value)}
              rows={6}
              disabled={adSetSaving}
            />
          </label>
          <div className="formGrid two">
            <label className="fieldGroup">
              <span>Audience controls JSON</span>
              <textarea
                className="codeTextarea"
                value={draft.audienceControls}
                onChange={(event) => update("audienceControls", event.target.value)}
                rows={4}
                disabled={adSetSaving}
              />
            </label>
            <label className="fieldGroup">
              <span>Audience recommendations JSON</span>
              <textarea
                className="codeTextarea"
                value={draft.audienceRecommendations}
                onChange={(event) => update("audienceRecommendations", event.target.value)}
                rows={4}
                disabled={adSetSaving}
              />
            </label>
          </div>
        </section>

        <section className="formSubsection">
          <div className="subsectionHeader">
            <h3>Placements and delivery controls</h3>
          </div>
          <div className="formGrid two">
            <label className="fieldGroup">
              <span>Placement mode</span>
              <select value={draft.placementMode} onChange={(event) => update("placementMode", event.target.value)} disabled={adSetSaving}>
                {placementModes.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="fieldGroup">
              <span>Placement settings JSON</span>
              <textarea
                className="codeTextarea"
                value={draft.placementSettings}
                onChange={(event) => update("placementSettings", event.target.value)}
                rows={4}
                disabled={adSetSaving}
              />
            </label>
            <label className="fieldGroup">
              <span>Brand safety controls JSON</span>
              <textarea
                className="codeTextarea"
                value={draft.brandSafetyControls}
                onChange={(event) => update("brandSafetyControls", event.target.value)}
                rows={4}
                disabled={adSetSaving}
              />
            </label>
            <label className="fieldGroup">
              <span>Ad set schedule JSON</span>
              <textarea
                className="codeTextarea"
                value={draft.adsetSchedule}
                onChange={(event) => update("adsetSchedule", event.target.value)}
                rows={4}
                disabled={adSetSaving}
              />
            </label>
            <label className="fieldGroup">
              <span>Frequency control specs JSON</span>
              <textarea
                className="codeTextarea"
                value={draft.frequencyControlSpecs}
                onChange={(event) => update("frequencyControlSpecs", event.target.value)}
                rows={4}
                disabled={adSetSaving}
              />
            </label>
          </div>
        </section>

        <section className="formSubsection">
          <div className="subsectionHeader">
            <h3>Compliance and promoted object</h3>
          </div>
          <div className="formGrid two">
            <label className="fieldGroup">
              <span>EU beneficiary</span>
              <input value={draft.beneficiary} onChange={(event) => update("beneficiary", event.target.value)} disabled={adSetSaving} />
            </label>
            <label className="fieldGroup">
              <span>EU payor</span>
              <input value={draft.payor} onChange={(event) => update("payor", event.target.value)} disabled={adSetSaving} />
            </label>
          </div>
          <label className="fieldGroup">
            <span>Promoted object JSON</span>
            <textarea
              className="codeTextarea"
              value={draft.promotedObject}
              onChange={(event) => update("promotedObject", event.target.value)}
              placeholder='{"pixel_id":"...", "custom_event_type":"LEAD"}'
              rows={5}
              disabled={adSetSaving}
            />
          </label>
        </section>
      </div>

      <div className="adDraftStack">
        <div className="subsectionHeader">
          <h3>Ad drafts</h3>
          <span>{adset.ads.length} creative{adset.ads.length === 1 ? "" : "s"}</span>
        </div>
        {adset.ads.length === 0 ? (
          <div className="inlineEmpty">No creatives assigned to this ad set yet.</div>
        ) : (
          adset.ads.map((ad) => (
            <AdDraftEditor
              key={ad.id}
              ad={ad}
              saving={saving === `ad-${ad.id}`}
              onSave={onSaveAd}
              onError={onError}
            />
          ))
        )}
      </div>
    </section>
  );
}

function AddCreativeModal({
  loading,
  adsetId,
  onClose,
  onAdd
}: {
  loading: boolean;
  adsetId: number;
  onClose: () => void;
  onAdd: (adsetId: number, creativeId: number) => void;
}) {
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loadingCreatives, setLoadingCreatives] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingCreatives(true);
    setError(null);
    fetchCreatives("ready")
      .then((items) => {
        if (!active) return;
        setCreatives(items);
        setSelectedId(items[0]?.id ?? null);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        if (active) setLoadingCreatives(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true">
      <div className="modal creativePickerModal">
        <div className="modalHeader">
          <div>
            <p className="eyebrow">Ready creatives</p>
            <h2>Add creative</h2>
          </div>
          <button className="iconButton" onClick={onClose} aria-label="Close" disabled={loading}>
            <X size={18} />
          </button>
        </div>

        {error ? <ErrorNotice message={error} /> : null}

        <div className="creativePickerList">
          {loadingCreatives ? (
            <div className="emptyState">
              <Loader2 className="spin" />
              Loading ready creatives
            </div>
          ) : creatives.length === 0 ? (
            <div className="emptyState">No ready creatives are available.</div>
          ) : (
            creatives.map((creative) => (
              <button
                key={creative.id}
                className={selectedId === creative.id ? "creativePickerRow selected" : "creativePickerRow"}
                onClick={() => setSelectedId(creative.id)}
              >
                <CreativePreview creative={creative} />
                <div>
                  <strong>{creative.source_file_name ?? creative.project_type ?? `Creative ${creative.id}`}</strong>
                  <span>{creative.ad_text ?? "No primary text yet"}</span>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="modalActions">
          <button className="secondaryButton" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="primaryButton" onClick={() => selectedId && onAdd(adsetId, selectedId)} disabled={loading || !selectedId}>
            {loading ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
            Add creative
          </button>
        </div>
      </div>
    </div>
  );
}

function CampaignDetailView({
  ready,
  id,
  onBack
}: {
  ready: boolean;
  id: number;
  onBack: () => void;
}) {
  const [campaign, setCampaign] = useState<CampaignDraftTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [addCreativeAdSetId, setAddCreativeAdSetId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      setCampaign(await fetchCampaignDraft(id));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [id, ready]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runSave(key: string, action: () => Promise<void>, message: string) {
    setSaving(key);
    setError(null);
    setSuccess(null);
    try {
      await action();
      await load();
      setSuccess(message);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(null);
    }
  }

  function saveCampaign(payload: CampaignDraftPayload) {
    void runSave("campaign", () => updateCampaignDraft(id, payload).then(() => undefined), "Campaign saved.");
  }

  function saveAdSet(adsetId: number, payload: AdSetDraftPayload) {
    void runSave(`adset-${adsetId}`, () => updateAdSetDraft(adsetId, payload).then(() => undefined), "Ad set saved.");
  }

  function saveAd(adId: number, payload: AdDraftPayload) {
    void runSave(`ad-${adId}`, () => updateAdDraft(adId, payload).then(() => undefined), "Ad draft saved.");
  }

  function addAdSet() {
    if (!campaign) return;
    void runSave(
      "create-adset",
      () =>
        createAdSetDraft(id, {
          name: `Ad set ${campaign.adsets.length + 1}`,
          destinationType: "WEBSITE",
          optimizationGoal: "LINK_CLICKS",
          billingEvent: "IMPRESSIONS",
          placementMode: "ADVANTAGE_PLUS",
          useAdvantageAudience: true,
          targeting: {},
          metaStatus: "PAUSED"
        }).then(() => undefined),
      "Ad set added."
    );
  }

  function addCreative(adsetId: number, creativeId: number) {
    void runSave(
      `add-creative-${adsetId}`,
      () => createAdDraft(adsetId, { creativeId }).then(() => undefined),
      "Creative added as an ad draft."
    );
    setAddCreativeAdSetId(null);
  }

  if (loading && !campaign) {
    return (
      <main className="content">
        <div className="emptyState">
          <Loader2 className="spin" />
          Loading campaign builder
        </div>
      </main>
    );
  }

  if (!campaign) {
    return (
      <main className="content">
        <header className="pageHeader">
          <button className="secondaryButton" onClick={onBack}>
            <ArrowLeft size={16} />
            Back
          </button>
        </header>
        {error ? <ErrorNotice message={error} /> : <div className="emptyState">Campaign draft not found.</div>}
      </main>
    );
  }

  return (
    <main className="content">
      <header className="pageHeader">
        <div>
          <button className="backButton" onClick={onBack}>
            <ArrowLeft size={16} />
            Campaign drafts
          </button>
          <p className="eyebrow">Campaign Builder</p>
          <h1>{campaign.name}</h1>
        </div>
        <div className="headerActions">
          <button className="secondaryButton" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? "spin" : ""} />
            Refresh
          </button>
          <button className="secondaryButton" disabled title="Meta publish is not implemented yet">
            <Megaphone size={16} />
            Review & publish coming next
          </button>
        </div>
      </header>

      <section className="summaryBand">
        <div>
          <span>{campaign.adsets.length}</span>
          <p>ad set drafts</p>
        </div>
        <div>
          <span>{countAds(campaign)}</span>
          <p>ad drafts</p>
        </div>
        <div>
          <span>{campaign.meta_status}</span>
          <p>Meta campaign status</p>
        </div>
      </section>

      {error ? <ErrorNotice message={error} /> : null}
      {success ? <SuccessNotice message={success} /> : null}

      <div className="builderStack">
        <CampaignSettingsForm
          campaign={campaign}
          saving={saving === "campaign"}
          onSave={saveCampaign}
          onError={setError}
        />

        <section className="builderSection flush">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Structure</p>
              <h2>Ad sets</h2>
            </div>
            <button className="primaryButton" onClick={addAdSet} disabled={saving === "create-adset"}>
              {saving === "create-adset" ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
              Add ad set
            </button>
          </div>
        </section>

        {campaign.adsets.length === 0 ? (
          <div className="emptyState">No ad sets yet. Add one to start assigning creatives.</div>
        ) : (
          campaign.adsets.map((adset) => (
            <AdSetEditor
              key={adset.id}
              adset={adset}
              campaignBudgetStrategy={campaign.budget_strategy}
              saving={saving}
              onSave={saveAdSet}
              onAddCreative={setAddCreativeAdSetId}
              onSaveAd={saveAd}
              onError={setError}
            />
          ))
        )}
      </div>

      {addCreativeAdSetId ? (
        <AddCreativeModal
          loading={saving === `add-creative-${addCreativeAdSetId}`}
          adsetId={addCreativeAdSetId}
          onClose={() => setAddCreativeAdSetId(null)}
          onAdd={addCreative}
        />
      ) : null}
    </main>
  );
}

function CampaignsPage({
  ready,
  campaignId,
  onOpen,
  onBack
}: {
  ready: boolean;
  campaignId?: number;
  onOpen: (id: number) => void;
  onBack: () => void;
}) {
  if (campaignId) {
    return <CampaignDetailView ready={ready} id={campaignId} onBack={onBack} />;
  }
  return <CampaignDraftListView ready={ready} onOpen={onOpen} />;
}

export function App() {
  const [ready, setReady] = useState(false);
  const [route, setRoute] = useState<RouteState>(activeRoute());
  const creativeView = route.area === "creatives" ? route.view : "dashboard";
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Creative | null>(null);
  const [launching, setLaunching] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    function handlePopstate() {
      setRoute(activeRoute());
    }

    window.addEventListener("popstate", handlePopstate);
    return () => window.removeEventListener("popstate", handlePopstate);
  }, []);

  useEffect(() => {
    async function initAuth() {
      if (isAuthDisabled()) {
        setReady(true);
        return;
      }

      const auth = getOktaAuth();
      if (!auth) return;

      if (window.location.pathname === "/login/callback") {
        await auth.handleLoginRedirect();
        window.history.replaceState({}, "", "/dashboard");
        setRoute({ area: "creatives", view: "dashboard" });
      }

      const authenticated = await auth.isAuthenticated();
      if (!authenticated) {
        await auth.signInWithRedirect();
        return;
      }

      setReady(true);
    }

    initAuth().catch((authError) => {
      setError(authError instanceof Error ? authError.message : String(authError));
      setReady(true);
    });
  }, []);

  const load = useCallback(async () => {
    if (route.area !== "creatives") return;
    setLoading(true);
    setError(null);
    try {
      setCreatives(await fetchCreatives(viewConfig[route.view].listKind));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [route]);

  useEffect(() => {
    if (ready && route.area === "creatives") {
      void load();
    }
  }, [load, ready, route.area]);

  const counts = useMemo(
    () => ({
      shown: creatives.length,
      viewLabel: viewConfig[creativeView].title
    }),
    [creatives.length, creativeView]
  );

  async function confirmLaunch(placement: LaunchRequest) {
    if (!selected) return;
    setLaunching(true);
    setError(null);
    try {
      await launchCreative(selected.id, placement);
      setSelected(null);
      await load();
    } catch (launchError) {
      setError(launchError instanceof Error ? launchError.message : String(launchError));
    } finally {
      setLaunching(false);
    }
  }

  async function handleSyncCampaigns() {
    setSyncing(true);
    setError(null);
    try {
      const count = await syncCampaigns();
      setError(`Synced ${count} campaign${count === 1 ? "" : "s"}.`);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : String(syncError));
    } finally {
      setSyncing(false);
    }
  }

  async function logout() {
    const auth = getOktaAuth();
    await auth?.signOut();
  }

  function navigateCreative(nextView: CreativeView) {
    setRoute({ area: "creatives", view: nextView });
    window.history.pushState({}, "", viewConfig[nextView].path);
  }

  function navigateCampaigns() {
    setRoute({ area: "campaigns" });
    window.history.pushState({}, "", "/campaigns");
  }

  function navigateCampaign(id: number) {
    setRoute({ area: "campaigns", campaignId: id });
    window.history.pushState({}, "", `/campaigns/${id}`);
  }

  return (
    <div className="appShell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">A</div>
          <div>
            <strong>Promo Ads</strong>
            <span>Launch dashboard</span>
          </div>
        </div>
        <nav>
          <section className="navSection">
            <button
              className={route.area === "creatives" ? "navPrimary active" : "navPrimary"}
              onClick={() => navigateCreative("dashboard")}
            >
              <ImageIcon size={18} />
              <span>
                <strong>Creatives</strong>
                <small>Assets and copy</small>
              </span>
              <ChevronRight size={16} />
            </button>
            <div className="subNav" aria-label="Creative status views">
              {creativeNavItems.map((item) => (
                <button
                  key={item}
                  className={route.area === "creatives" && creativeView === item ? "subNavItem active" : "subNavItem"}
                  onClick={() => navigateCreative(item)}
                >
                  <span className="subNavDot" />
                  {viewConfig[item].navLabel}
                </button>
              ))}
            </div>
          </section>
          <section className="navSection">
            <button className={route.area === "campaigns" ? "navPrimary active" : "navPrimary"} onClick={navigateCampaigns}>
              <Megaphone size={18} />
              <span>
                <strong>Campaign Builder</strong>
                <small>Campaigns, ad sets, ads</small>
              </span>
              <ChevronRight size={16} />
            </button>
            <div className="subNav" aria-label="Campaign views">
              <button className={route.area === "campaigns" ? "subNavItem active" : "subNavItem"} onClick={navigateCampaigns}>
                <span className="subNavDot" />
                Drafts
              </button>
            </div>
          </section>
        </nav>
        {!isAuthDisabled() ? (
          <button className="secondaryButton sidebarLogout" onClick={logout}>
            <LogOut size={16} />
            Logout
          </button>
        ) : null}
      </aside>

      {route.area === "campaigns" ? (
        <CampaignsPage ready={ready} campaignId={route.campaignId} onOpen={navigateCampaign} onBack={navigateCampaigns} />
      ) : (
        <main className="content">
          <header className="pageHeader">
            <div>
              <p className="eyebrow">
                Creatives <ChevronRight size={12} /> {viewConfig[creativeView].navLabel}
              </p>
              <h1>{counts.viewLabel}</h1>
            </div>
            <div className="headerActions">
              <button className="secondaryButton" onClick={load} disabled={loading}>
                <RefreshCw size={16} className={loading ? "spin" : ""} />
                Refresh
              </button>
              <button className="secondaryButton" onClick={handleSyncCampaigns} disabled={syncing}>
                {syncing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
                Sync campaigns
              </button>
            </div>
          </header>

          <section className="summaryBand">
            <div>
              <span>{counts.shown}</span>
              <p>{viewConfig[creativeView].summary}</p>
            </div>
            <div>
              <span>Notion</span>
              <p>Ads view is the source of truth</p>
            </div>
            <div>
              <span>Meta</span>
              <p>Assets upload before launch</p>
            </div>
          </section>

          {error ? (
            <div className={error.startsWith("Synced") ? "notice success" : "notice"}>
              <AlertCircle size={18} />
              {error}
            </div>
          ) : null}

          <section className="listPanel">
            {loading ? (
              <div className="emptyState">
                <Loader2 className="spin" />
                Loading creatives
              </div>
            ) : creatives.length === 0 ? (
              <div className="emptyState">{viewConfig[creativeView].empty}</div>
            ) : (
              creatives.map((creative) => (
                <CreativeRow
                  key={creative.id}
                  creative={creative}
                  onLaunch={creativeView === "dashboard" ? setSelected : undefined}
                />
              ))
            )}
          </section>
        </main>
      )}

      {selected ? (
        <ConfirmModal
          creative={selected}
          loading={launching}
          onClose={() => setSelected(null)}
          onConfirm={confirmLaunch}
        />
      ) : null}
    </div>
  );
}
