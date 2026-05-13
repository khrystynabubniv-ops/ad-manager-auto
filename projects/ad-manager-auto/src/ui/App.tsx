import { AlertCircle, Check, ExternalLink, Loader2, LogOut, Play, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getOktaAuth, isAuthDisabled } from "./auth";
import {
  Creative,
  CreativeListKind,
  LaunchPlacement,
  MetaAdSet,
  MetaCampaign,
  fetchAdSets,
  fetchCampaigns,
  fetchCreatives,
  launchCreative,
  syncCampaigns
} from "./api";

type View = "dashboard" | "needs-details" | "upload-failed" | "launched";

const viewConfig: Record<
  View,
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

function activeView(): View {
  if (window.location.pathname.includes("needs-details")) return "needs-details";
  if (window.location.pathname.includes("upload-failed")) return "upload-failed";
  return window.location.pathname.includes("launched") ? "launched" : "dashboard";
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

function ConfirmModal({
  creative,
  loading,
  onClose,
  onConfirm
}: {
  creative: Creative;
  loading: boolean;
  onClose: () => void;
  onConfirm: (placement: LaunchPlacement) => void;
}) {
  const [campaigns, setCampaigns] = useState<MetaCampaign[]>([]);
  const [adSets, setAdSets] = useState<MetaAdSet[]>([]);
  const [campaignId, setCampaignId] = useState(creative.campaign_id ?? "");
  const [adSetId, setAdSetId] = useState(creative.adset_id ?? "");
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [adSetsLoading, setAdSetsLoading] = useState(false);
  const [placementError, setPlacementError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setCampaignId(creative.campaign_id ?? "");
    setAdSetId(creative.adset_id ?? "");
    setCampaignsLoading(true);
    setPlacementError(null);

    fetchCampaigns()
      .then((items) => {
        if (!active) return;
        setCampaigns(items);
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

  function confirmPlacement() {
    if (!campaignId || !adSetId) {
      setPlacementError("Choose a campaign and ad set before launch.");
      return;
    }

    onConfirm({
      campaignId,
      campaignName: selectedCampaign?.name,
      adSetId,
      adSetName: selectedAdSet?.name
    });
  }

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modalHeader">
          <div>
            <p className="eyebrow">Confirm launch</p>
            <h2>{creative.project_type ?? "Promo ad"}</h2>
          </div>
          <button className="iconButton" onClick={onClose} aria-label="Close" disabled={loading}>
            ×
          </button>
        </div>

        <div className="modalGrid">
          <CreativePreview creative={creative} />
          <dl className="detailsList">
            <div>
              <dt>Ad text</dt>
              <dd>{creative.ad_text}</dd>
            </div>
            <div>
              <dt>CTA link</dt>
              <dd>{creative.cta_link}</dd>
            </div>
            <div>
              <dt>Audience</dt>
              <dd>{creative.audience}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>{creative.location}</dd>
            </div>
            <div>
              <dt>Campaign</dt>
              <dd>{creative.campaign_name ?? creative.campaign_id}</dd>
            </div>
            <div>
              <dt>Ad set</dt>
              <dd>{creative.adset_name ?? creative.adset_id ?? "Not selected"}</dd>
            </div>
          </dl>
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
            disabled={loading || campaignsLoading || adSetsLoading || !placementReady}
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
  return (
    <article className="creativeRow">
      <CreativePreview creative={creative} />
      <div className="creativeMain">
        <div className="creativeTitleLine">
          <h3>{creative.project_type ?? "Promo creative"}</h3>
          <span className={`statusChip ${creative.status}`}>{creative.status.replaceAll("_", " ")}</span>
        </div>
        {creative.source_file_name ? <p className="creativeFileName">{creative.source_file_name}</p> : null}
        <p className="adText">{creative.ad_text}</p>
        <div className="metaGrid">
          <span>{creative.campaign_name ?? creative.campaign_id ?? "No campaign"}</span>
          <span>{creative.adset_name ?? creative.adset_id ?? "No ad set"}</span>
          <span>{creative.location ?? "No location"}</span>
          <span>{creative.audience ?? "No audience"}</span>
          <span>{formatDate(creative.uploaded_at ?? creative.updated_at)}</span>
        </div>
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
          <Check size={20} className="doneIcon" />
        ) : (
          <AlertCircle size={20} className="blockedIcon" />
        )}
      </div>
    </article>
  );
}

export function App() {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>(activeView());
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Creative | null>(null);
  const [launching, setLaunching] = useState(false);
  const [syncing, setSyncing] = useState(false);

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
    setLoading(true);
    setError(null);
    try {
      setCreatives(await fetchCreatives(viewConfig[view].listKind));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    if (ready) {
      void load();
    }
  }, [load, ready]);

  const counts = useMemo(
    () => ({
      shown: creatives.length,
      viewLabel: viewConfig[view].title
    }),
    [creatives.length, view]
  );

  async function confirmLaunch(placement: LaunchPlacement) {
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

  function navigate(nextView: View) {
    setView(nextView);
    window.history.pushState({}, "", viewConfig[nextView].path);
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
          {(Object.keys(viewConfig) as View[]).map((item) => (
            <button
              key={item}
              className={view === item ? "navItem active" : "navItem"}
              onClick={() => navigate(item)}
            >
              {viewConfig[item].navLabel}
            </button>
          ))}
        </nav>
        {!isAuthDisabled() ? (
          <button className="secondaryButton sidebarLogout" onClick={logout}>
            <LogOut size={16} />
            Logout
          </button>
        ) : null}
      </aside>

      <main className="content">
        <header className="pageHeader">
          <div>
            <p className="eyebrow">Facebook promo automation</p>
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
            <p>{viewConfig[view].summary}</p>
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
            <div className="emptyState">{viewConfig[view].empty}</div>
          ) : (
            creatives.map((creative) => (
              <CreativeRow
                key={creative.id}
                creative={creative}
                onLaunch={view === "dashboard" ? setSelected : undefined}
              />
            ))
          )}
        </section>
      </main>

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
