/**
 * GenerationStudio — multi-model AI video generation surface.
 *
 * Phase 12 Step 2: model picker grid only. Fetches /api/models and renders one
 * card per provider. Prompt input + submit + recent history land in Steps 5/6.
 */

import { useEffect, useState } from 'react';
import { Wand2, Key, ExternalLink, AlertCircle } from 'lucide-react';
import { API_BASE_URL } from '../../config/api';
import {
  type VideoProvider,
  type ModelsResponse,
  VIDEO_PROVIDERS_FALLBACK,
  estimateCostUsd,
} from '../../constants/videoProviders';
import ApiKeysPanel from '../settings/ApiKeysPanel';

export default function GenerationStudio() {
  const [providers, setProviders] = useState<VideoProvider[]>(VIDEO_PROVIDERS_FALLBACK);
  const [selectedModel, setSelectedModel] = useState<string>(VIDEO_PROVIDERS_FALLBACK[0]?.model_id ?? '');
  const [duration, setDuration] = useState<number>(8);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showKeysPanel, setShowKeysPanel] = useState(false);

  const reloadModels = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/models`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ModelsResponse = await res.json();
      setProviders(data.models);
      setLoadError(null);
      return data.models;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load models');
      return null;
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const models = await reloadModels();
      if (cancelled || !models || models.length === 0) {
        setLoading(false);
        return;
      }
      setSelectedModel(models[0].model_id);
      setDuration(models[0].durations_sec[0] ?? 8);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const selected = providers.find((p) => p.model_id === selectedModel);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display font-extrabold text-dark-text" style={{ fontSize: 'clamp(1.75rem,3vw,2.5rem)', letterSpacing: '-0.03em' }}>
            Generate
          </h1>
          <p className="text-dark-text-muted mt-2 max-w-xl">
            Pick a model, write a prompt, ship a clip. Pay with platform credits or use your own API key.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowKeysPanel(true)}
          className="flex items-center gap-2 rounded-xl border border-glass-border bg-glass-white hover:bg-glass-white-hover px-4 py-2 text-sm font-medium text-dark-text transition"
        >
          <Key className="h-4 w-4" /> Manage keys
        </button>
      </header>

      {showKeysPanel && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4 sm:p-8" onClick={() => setShowKeysPanel(false)}>
          <div className="w-full max-w-2xl rounded-2xl border border-white/[0.08] bg-dark-bg p-6 my-auto" onClick={(e) => e.stopPropagation()}>
            <ApiKeysPanel onClose={() => { setShowKeysPanel(false); void reloadModels(); }} />
          </div>
        </div>
      )}

      {loadError && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
          <AlertCircle className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <div className="font-semibold text-amber-200">Showing offline model list</div>
            <div className="text-amber-200/70 mt-1">Could not reach /api/models ({loadError}). Cards below are from fallback constants — platform availability unknown.</div>
          </div>
        </div>
      )}

      <section>
        <h2 className="text-[11px] font-bold tracking-[0.16em] uppercase text-cyan-300 mb-4">Choose your model</h2>
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-white/[0.08] bg-glass-white h-40 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {providers.map((p) => {
              const isSelected = p.model_id === selectedModel;
              return (
                <button
                  key={p.model_id}
                  type="button"
                  onClick={() => {
                    setSelectedModel(p.model_id);
                    setDuration(p.durations_sec[0] ?? 8);
                  }}
                  className={`group relative text-left rounded-2xl border p-4 transition-all ${
                    isSelected
                      ? 'border-white/40 bg-white/[0.06] ring-2 ring-white/30'
                      : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20'
                  }`}
                  style={isSelected ? { boxShadow: `0 0 0 1px ${p.brand_color}66, 0 8px 24px ${p.brand_color}33` } : undefined}
                >
                  <div
                    className="h-2 w-12 rounded-full mb-3"
                    style={{ background: p.brand_color }}
                  />
                  <div className="text-dark-text font-bold text-sm leading-tight">{p.display_name}</div>
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold tracking-wider uppercase rounded-md px-2 py-0.5 ${
                      p.byok_only
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/25'
                        : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
                    }`}>
                      {p.byok_only ? 'BYOK only' : 'Platform'}
                    </span>
                    <span className="text-[10px] text-dark-text-muted">${p.cost_per_sec_usd.toFixed(2)}/s</span>
                  </div>
                  <div className="mt-2 text-[11px] text-dark-text-muted">
                    {p.durations_sec.join('s · ')}s · {p.ratios.join(' · ')}
                  </div>
                  {p.byok_only && (
                    <a
                      href={p.where_to_get_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-3 inline-flex items-center gap-1 text-[11px] text-amber-300 hover:text-amber-200"
                    >
                      Get key <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {selected && (
        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
          <div className="flex items-center gap-3 mb-4">
            <Wand2 className="h-5 w-5 text-cyan-300" />
            <h2 className="font-display font-bold text-dark-text text-lg">Configure</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold tracking-[0.16em] uppercase text-cyan-300 block mb-2">Duration</label>
              <div className="flex gap-2 flex-wrap">
                {selected.durations_sec.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold border ${
                      duration === d
                        ? 'bg-white/10 border-white/30 text-dark-text'
                        : 'bg-glass-white border-glass-border text-dark-text-muted hover:bg-glass-white-hover'
                    }`}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold tracking-[0.16em] uppercase text-cyan-300 block mb-2">Estimated cost</label>
              <div className="text-2xl font-bold text-dark-text">
                ${estimateCostUsd(selected, duration, selected.byok_only).toFixed(2)}
                {selected.byok_only && <span className="text-sm text-amber-300 ml-2 font-normal">billed to your account</span>}
              </div>
              {!selected.byok_only && (
                <div className="text-[11px] text-dark-text-muted mt-1">
                  ${selected.cost_per_sec_usd.toFixed(2)}/s × {duration}s + 25% platform markup
                </div>
              )}
            </div>
          </div>
          <div className="mt-6 rounded-xl border border-dashed border-white/[0.12] p-6 text-center text-sm text-dark-text-muted">
            Prompt input, submit, and history feed coming in step 5.
          </div>
        </section>
      )}
    </div>
  );
}
