/**
 * GenerationStudio — multi-model AI video generation surface.
 *
 * Picks a model, writes a prompt, submits to /api/generate, and polls the
 * recent-jobs history every 5s while any job is queued|running.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Wand2, Key, ExternalLink, AlertCircle, Send, Download, Loader2, Film, Clock, CheckCircle2, XCircle,
} from 'lucide-react';
import { API_BASE_URL } from '../../config/api';
import {
  type VideoProvider,
  type ModelsResponse,
  VIDEO_PROVIDERS_FALLBACK,
  estimateCostUsd,
} from '../../constants/videoProviders';
import { getAuthHeaders } from '../../utils/getAuthToken';
import ApiKeysPanel from '../settings/ApiKeysPanel';

type JobStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed';

interface GenerationJob {
  job_id: string;
  model_id: string;
  prompt: string;
  duration_sec: number;
  ratio: string;
  status: JobStatus;
  video_url: string | null;
  error: string | null;
  cost_usd: number | null;
  estimated_cost_usd: number | null;
  pay_with: 'credits' | 'byok' | null;
  created_at: string | null;
  completed_at: string | null;
}

const RATIOS = ['16:9', '9:16', '1:1'] as const;
type Ratio = (typeof RATIOS)[number];

export default function GenerationStudio() {
  const [providers, setProviders] = useState<VideoProvider[]>(VIDEO_PROVIDERS_FALLBACK);
  const [selectedModel, setSelectedModel] = useState<string>(VIDEO_PROVIDERS_FALLBACK[0]?.model_id ?? '');
  const [duration, setDuration] = useState<number>(8);
  const [ratio, setRatio] = useState<Ratio>('16:9');
  const [prompt, setPrompt] = useState('');
  const [payWith, setPayWith] = useState<'credits' | 'byok'>('credits');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showKeysPanel, setShowKeysPanel] = useState(false);
  const pollTimer = useRef<number | null>(null);

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

  const loadJobs = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/api/generate?limit=20`, { headers });
      if (!res.ok) return;
      const data: { jobs: GenerationJob[] } = await res.json();
      setJobs(data.jobs ?? []);
    } catch {
      /* non-fatal — keep last-known jobs on transient errors */
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const models = await reloadModels();
      if (!cancelled && models && models.length > 0) {
        setSelectedModel(models[0].model_id);
        setDuration(models[0].durations_sec[0] ?? 8);
        setRatio((models[0].ratios[0] ?? '16:9') as Ratio);
      }
      await loadJobs();
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Poll every 5s while any job is non-terminal.
  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === 'pending' || j.status === 'queued' || j.status === 'running');
    if (!hasActive) {
      if (pollTimer.current) { window.clearInterval(pollTimer.current); pollTimer.current = null; }
      return;
    }
    if (pollTimer.current) return;
    pollTimer.current = window.setInterval(() => { void loadJobs(); }, 5000);
    return () => {
      if (pollTimer.current) { window.clearInterval(pollTimer.current); pollTimer.current = null; }
    };
  }, [jobs]);

  const selected = providers.find((p) => p.model_id === selectedModel);
  const allowedRatios = selected?.ratios ?? RATIOS;
  const effectiveRatio: Ratio = (allowedRatios.includes(ratio) ? ratio : allowedRatios[0]) as Ratio;

  const canSubmit = Boolean(selected) && prompt.trim().length >= 3 && !submitting;

  const submit = async () => {
    if (!selected || !canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/api/generate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model_id: selected.model_id,
          prompt: prompt.trim(),
          duration_sec: duration,
          ratio: effectiveRatio,
          pay_with: payWith,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.detail ?? `HTTP ${res.status}`);
      }
      setPrompt('');
      await loadJobs();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'submit failed');
    } finally {
      setSubmitting(false);
    }
  };

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
            <div className="text-amber-200/70 mt-1">Could not reach /api/models ({loadError}). Cards below are from fallback constants.</div>
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
                    setRatio((p.ratios[0] ?? '16:9') as Ratio);
                  }}
                  className={`group relative text-left rounded-2xl border p-4 transition-all ${
                    isSelected
                      ? 'border-white/40 bg-white/[0.06] ring-2 ring-white/30'
                      : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20'
                  }`}
                  style={isSelected ? { boxShadow: `0 0 0 1px ${p.brand_color}66, 0 8px 24px ${p.brand_color}33` } : undefined}
                >
                  <div className="h-2 w-12 rounded-full mb-3" style={{ background: p.brand_color }} />
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            <div>
              <label className="text-[11px] font-bold tracking-[0.16em] uppercase text-cyan-300 block mb-2">Duration</label>
              <div className="flex gap-2 flex-wrap">
                {selected.durations_sec.map((d) => (
                  <button
                    key={d} type="button" onClick={() => setDuration(d)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold border ${
                      duration === d
                        ? 'bg-white/10 border-white/30 text-dark-text'
                        : 'bg-glass-white border-glass-border text-dark-text-muted hover:bg-glass-white-hover'
                    }`}
                  >{d}s</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold tracking-[0.16em] uppercase text-cyan-300 block mb-2">Aspect</label>
              <div className="flex gap-2 flex-wrap">
                {allowedRatios.map((r) => (
                  <button
                    key={r} type="button" onClick={() => setRatio(r as Ratio)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold border ${
                      effectiveRatio === r
                        ? 'bg-white/10 border-white/30 text-dark-text'
                        : 'bg-glass-white border-glass-border text-dark-text-muted hover:bg-glass-white-hover'
                    }`}
                  >{r}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold tracking-[0.16em] uppercase text-cyan-300 block mb-2">Pay with</label>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setPayWith('credits')}
                  disabled={selected.byok_only}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold border ${
                    payWith === 'credits' && !selected.byok_only
                      ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
                      : 'bg-glass-white border-glass-border text-dark-text-muted hover:bg-glass-white-hover disabled:opacity-40 disabled:cursor-not-allowed'
                  }`}
                  title={selected.byok_only ? 'Platform billing not available — add a BYOK key' : ''}
                >Credits</button>
                <button
                  type="button"
                  onClick={() => setPayWith('byok')}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold border ${
                    payWith === 'byok'
                      ? 'bg-amber-500/15 border-amber-400/40 text-amber-200'
                      : 'bg-glass-white border-glass-border text-dark-text-muted hover:bg-glass-white-hover'
                  }`}
                >My API key</button>
              </div>
            </div>
          </div>

          <label className="text-[11px] font-bold tracking-[0.16em] uppercase text-cyan-300 block mb-2">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A neon-lit Tokyo alleyway at night, camera drifting forward, cinematic lighting, 4k"
            rows={3}
            className="w-full rounded-xl border border-glass-border bg-glass-white p-4 text-dark-text placeholder:text-dark-text-muted/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
          />

          <div className="mt-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-2xl font-bold text-dark-text">
                ${estimateCostUsd(selected, duration, payWith === 'byok').toFixed(2)}
                {payWith === 'byok' && <span className="text-sm text-amber-300 ml-2 font-normal">billed to your account</span>}
              </div>
              {payWith === 'credits' && (
                <div className="text-[11px] text-dark-text-muted mt-1">
                  ${selected.cost_per_sec_usd.toFixed(2)}/s × {duration}s + 25% platform markup
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-indigo-500 hover:brightness-110 px-5 py-3 text-sm font-bold text-white shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitting ? 'Submitting…' : 'Generate'}
            </button>
          </div>

          {submitError && (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/[0.08] px-3 py-2 text-sm text-red-200">
              {submitError}
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="text-[11px] font-bold tracking-[0.16em] uppercase text-cyan-300 mb-4 flex items-center gap-2">
          <Film className="h-3.5 w-3.5" /> Recent generations
        </h2>
        {jobs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/[0.1] p-10 text-center text-sm text-dark-text-muted">
            Your generated clips will land here.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {jobs.map((j) => <JobCard key={j.job_id} job={j} />)}
          </div>
        )}
      </section>
    </div>
  );
}


function JobCard({ job }: { job: GenerationJob }) {
  const terminal = job.status === 'completed' || job.status === 'failed';
  const active = !terminal;
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden flex flex-col">
      <div className="aspect-video bg-black/60 flex items-center justify-center">
        {job.status === 'completed' && job.video_url ? (
          <video src={job.video_url} controls className="w-full h-full object-contain" />
        ) : job.status === 'failed' ? (
          <div className="flex items-center gap-2 text-red-300 text-sm px-4 text-center">
            <XCircle className="h-4 w-4 flex-shrink-0" /> {job.error ?? 'generation failed'}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-dark-text-muted">
            <Loader2 className="h-6 w-6 animate-spin" />
            <div className="text-xs uppercase tracking-wider">{job.status}</div>
          </div>
        )}
      </div>
      <div className="p-3 space-y-2">
        <div className="text-xs text-dark-text-muted flex items-center gap-1.5">
          {job.status === 'completed' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            : job.status === 'failed' ? <XCircle className="h-3.5 w-3.5 text-red-400" />
            : <Clock className="h-3.5 w-3.5 text-cyan-300" />}
          <span className="font-semibold text-dark-text">{job.model_id}</span>
          <span>·</span>
          <span>{job.duration_sec}s · {job.ratio}</span>
        </div>
        <div className="text-xs text-dark-text-muted line-clamp-2" title={job.prompt}>{job.prompt}</div>
        {job.status === 'completed' && job.video_url && (
          <div className="flex items-center gap-2 pt-1">
            <a
              href={job.video_url} download
              className="inline-flex items-center gap-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 px-2 py-1 text-[11px] font-semibold text-dark-text"
            >
              <Download className="h-3 w-3" /> Download
            </a>
            {job.cost_usd != null && (
              <span className="text-[10px] text-dark-text-muted">${job.cost_usd.toFixed(2)}</span>
            )}
          </div>
        )}
        {active && (
          <div className="h-1 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full w-1/3 bg-gradient-to-r from-cyan-400 to-indigo-500 animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
}
