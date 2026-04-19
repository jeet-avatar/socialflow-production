/**
 * ApiKeysPanel — manages user's BYOK keys for the multi-model generation flow.
 *
 * One row per provider (fal, runway, luma, higgsfield, openai, kling, vertex).
 * - PUT /api/byok/{provider}    saves + validates
 * - GET /api/byok               lists what user has stored (never returns plaintext)
 * - POST /api/byok/{provider}/validate  re-tests stored key
 * - DELETE /api/byok/{provider} removes
 */

import { useEffect, useState } from 'react';
import { Key, Trash2, RefreshCw, ExternalLink, Check, AlertCircle, X, Plus } from 'lucide-react';
import { API_BASE_URL } from '../../config/api';
import { getAuthHeaders } from '../../utils/getAuthToken';
import { VIDEO_PROVIDERS_FALLBACK } from '../../constants/videoProviders';

const MULTI_FIELD = new Set(['kling', 'vertex']);

interface StoredKey {
  provider: string;
  has_key: boolean;
  key_hint: string | null;
  validated: boolean;
  validated_at: string | null;
  validation_error: string | null;
  last_used_at: string | null;
  created_at: string | null;
}

interface ProviderRow {
  byok_key: string;
  display_name: string;
  brand_color: string;
  where_to_get_url: string;
}

// Distinct list of byok_keys (fal covers 4 models — only one row in the UI).
const PROVIDER_ROWS: ProviderRow[] = (() => {
  const seen = new Set<string>();
  const rows: ProviderRow[] = [];
  for (const p of VIDEO_PROVIDERS_FALLBACK) {
    if (seen.has(p.byok_key)) continue;
    seen.add(p.byok_key);
    rows.push({
      byok_key: p.byok_key,
      display_name: p.byok_key === 'fal' ? 'fal.ai (covers Veo 3, Kling, Pika, Hailuo)' : p.display_name,
      brand_color: p.brand_color,
      where_to_get_url: p.where_to_get_url,
    });
  }
  return rows;
})();

export default function ApiKeysPanel({ onClose }: { onClose?: () => void }) {
  const [stored, setStored] = useState<Record<string, StoredKey>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/api/byok`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { providers: StoredKey[] } = await res.json();
      const map: Record<string, StoredKey> = {};
      for (const p of data.providers) map[p.provider] = p;
      setStored(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleSave = async (provider: string, body: Record<string, string>) => {
    setBusy(provider);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/api/byok/${provider}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
      setEditingProvider(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (provider: string) => {
    if (!confirm(`Delete stored ${provider} key? This can't be undone.`)) return;
    setBusy(provider);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/api/byok/${provider}`, { method: 'DELETE', headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'delete failed');
    } finally {
      setBusy(null);
    }
  };

  const handleValidate = async (provider: string) => {
    setBusy(provider);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/api/byok/${provider}/validate`, { method: 'POST', headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'validate failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-cyan-300" />
            <h2 className="font-display font-bold text-dark-text text-xl">API Keys</h2>
          </div>
          <p className="text-sm text-dark-text-muted mt-1">
            Bring your own keys. We encrypt them with AES-256-GCM and never display the plaintext again.
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-glass-white-hover" aria-label="Close">
            <X className="h-5 w-5 text-dark-text-muted" />
          </button>
        )}
      </header>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/[0.06] p-3">
          <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
          <span className="text-sm text-red-200">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-glass-white animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {PROVIDER_ROWS.map((row) => {
            const s = stored[row.byok_key];
            const isEditing = editingProvider === row.byok_key;
            const isBusy = busy === row.byok_key;
            return (
              <div
                key={row.byok_key}
                className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="h-8 w-1.5 rounded-full" style={{ background: row.brand_color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-dark-text font-semibold text-sm">{row.display_name}</div>
                    {s ? (
                      <div className="text-xs text-dark-text-muted mt-0.5 flex items-center gap-2 flex-wrap">
                        <span className="font-mono">{s.key_hint}</span>
                        {s.validated ? (
                          <span className="inline-flex items-center gap-1 text-emerald-300">
                            <Check className="h-3 w-3" /> validated
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-300">
                            <AlertCircle className="h-3 w-3" /> {s.validation_error ?? 'not validated'}
                          </span>
                        )}
                        {s.last_used_at && (
                          <span>· last used {new Date(s.last_used_at).toLocaleDateString()}</span>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-dark-text-muted mt-0.5">Not configured</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {s && (
                      <button
                        onClick={() => handleValidate(row.byok_key)}
                        disabled={isBusy}
                        title="Re-test stored key"
                        className="rounded-lg p-2 hover:bg-glass-white-hover disabled:opacity-50"
                      >
                        <RefreshCw className={`h-4 w-4 text-dark-text-muted ${isBusy ? 'animate-spin' : ''}`} />
                      </button>
                    )}
                    <a
                      href={row.where_to_get_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      title="Get key"
                      className="rounded-lg p-2 hover:bg-glass-white-hover"
                    >
                      <ExternalLink className="h-4 w-4 text-dark-text-muted" />
                    </a>
                    <button
                      onClick={() => setEditingProvider(isEditing ? null : row.byok_key)}
                      disabled={isBusy}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-glass-border bg-glass-white hover:bg-glass-white-hover text-dark-text disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      {s ? 'Replace' : (<><Plus className="h-3 w-3" /> Add</>)}
                    </button>
                    {s && (
                      <button
                        onClick={() => handleDelete(row.byok_key)}
                        disabled={isBusy}
                        title="Delete key"
                        className="rounded-lg p-2 hover:bg-red-500/15 text-red-300 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {isEditing && (
                  <KeyForm
                    provider={row.byok_key}
                    onCancel={() => setEditingProvider(null)}
                    onSave={(body) => handleSave(row.byok_key, body)}
                    busy={isBusy}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KeyForm({
  provider,
  onCancel,
  onSave,
  busy,
}: {
  provider: string;
  onCancel: () => void;
  onSave: (body: Record<string, string>) => void;
  busy: boolean;
}) {
  const [v1, setV1] = useState('');
  const [v2, setV2] = useState('');
  const isMulti = MULTI_FIELD.has(provider);

  const submit = () => {
    if (provider === 'kling') onSave({ access: v1.trim(), secret: v2.trim() });
    else if (provider === 'vertex') onSave({ key: v1.trim(), project_id: v2.trim() });
    else onSave({ api_key: v1.trim() });
  };

  const labels: Record<string, [string, string?]> = {
    kling: ['Access key', 'Secret key'],
    vertex: ['Service-account JSON or base64', 'GCP project ID'],
  };
  const [l1, l2] = labels[provider] ?? ['API key'];

  return (
    <div className="mt-4 pt-4 border-t border-white/[0.08] space-y-3">
      <div>
        <label className="text-[10px] font-bold tracking-[0.16em] uppercase text-cyan-300 block mb-1">{l1}</label>
        <input
          type="password"
          autoComplete="off"
          value={v1}
          onChange={(e) => setV1(e.target.value)}
          placeholder={l1}
          className="w-full rounded-lg bg-black/30 border border-glass-border px-3 py-2 text-sm font-mono text-dark-text placeholder:text-dark-text-muted/50 focus:outline-none focus:ring-2 focus:ring-cyan-300/40"
        />
      </div>
      {isMulti && l2 && (
        <div>
          <label className="text-[10px] font-bold tracking-[0.16em] uppercase text-cyan-300 block mb-1">{l2}</label>
          <input
            type={provider === 'vertex' ? 'text' : 'password'}
            autoComplete="off"
            value={v2}
            onChange={(e) => setV2(e.target.value)}
            placeholder={l2}
            className="w-full rounded-lg bg-black/30 border border-glass-border px-3 py-2 text-sm font-mono text-dark-text placeholder:text-dark-text-muted/50 focus:outline-none focus:ring-2 focus:ring-cyan-300/40"
          />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} disabled={busy} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-dark-text-muted hover:text-dark-text">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={busy || !v1.trim() || (isMulti && !v2.trim())}
          className="rounded-lg px-4 py-1.5 text-xs font-semibold bg-cyan-500/20 border border-cyan-300/30 text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save & validate'}
        </button>
      </div>
    </div>
  );
}
