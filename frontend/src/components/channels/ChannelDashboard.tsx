import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Settings, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react';
import { getAuthHeaders } from '../../utils/getAuthToken';
import { API_BASE_URL } from '../../config/api';

interface Channel {
  id: string;
  user_id: string;
  name: string;
  platform: 'youtube' | 'instagram' | 'facebook' | 'tiktok' | 'linkedin';
  niche?: string;
  posting_frequency: 'daily' | '3x_week' | 'weekly';
  auto_post: boolean;
  review_window_minutes: number;
  created_at: string;
  updated_at: string;
}

const PLATFORMS = ['youtube', 'instagram', 'facebook', 'tiktok', 'linkedin'] as const;
const FREQUENCIES = ['daily', '3x_week', 'weekly'] as const;

interface ChannelDashboardProps {
  onOpenPipeline: (channelId: string) => void;
}

const PLATFORM_BADGE_CLASSES: Record<string, string> = {
  youtube: 'bg-red-500/20 text-red-400 border border-red-500/30',
  instagram: 'bg-pink-500/20 text-pink-400 border border-pink-500/30',
  facebook: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  tiktok: 'bg-white/10 text-white border border-white/20',
  linkedin: 'bg-blue-400/20 text-blue-300 border border-blue-400/30',
};

const FREQUENCY_LABEL: Record<string, string> = {
  daily: 'Daily',
  '3x_week': '3×/week',
  weekly: 'Weekly',
};

export default function ChannelDashboard({ onOpenPipeline }: ChannelDashboardProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formPlatform, setFormPlatform] = useState<string>('youtube');
  const [formNiche, setFormNiche] = useState('');
  const [formFrequency, setFormFrequency] = useState<string>('weekly');
  const [formAutoPost, setFormAutoPost] = useState(false);

  useEffect(() => {
    async function fetchChannels() {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`${API_BASE_URL}/channels/`, { headers });
        if (!res.ok) throw new Error('Failed to fetch channels');
        const data: Channel[] = await res.json();
        setChannels(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }
    fetchChannels();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/channels/`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          platform: formPlatform,
          niche: formNiche || undefined,
          posting_frequency: formFrequency,
          auto_post: formAutoPost,
        }),
      });
      if (!res.ok) throw new Error('Failed to create channel');
      const created: Channel = await res.json();
      setChannels(prev => [...prev, created]);
      setShowCreateModal(false);
      // Reset form
      setFormName('');
      setFormPlatform('youtube');
      setFormNiche('');
      setFormFrequency('weekly');
      setFormAutoPost(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create channel');
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleAutoPost(channel: Channel) {
    // Optimistic update
    setChannels(prev =>
      prev.map(c => c.id === channel.id ? { ...c, auto_post: !c.auto_post } : c)
    );
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/channels/${channel.id}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_post: !channel.auto_post }),
      });
      if (!res.ok) {
        // Revert optimistic update on failure
        setChannels(prev =>
          prev.map(c => c.id === channel.id ? { ...c, auto_post: channel.auto_post } : c)
        );
        return;
      }
      const updated: Channel = await res.json();
      setChannels(prev => prev.map(c => c.id === updated.id ? updated : c));
    } catch {
      // Revert optimistic update on error
      setChannels(prev =>
        prev.map(c => c.id === channel.id ? { ...c, auto_post: channel.auto_post } : c)
      );
    }
  }

  const inputClass =
    'w-full rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-2.5 text-sm text-dark-text focus:outline-none focus:border-teal-500/50 placeholder:text-dark-text-muted';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-dark-text">Channels</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-400 px-4 py-2 text-sm font-medium text-dark-bg hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          New Channel
        </button>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      ) : channels.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-dark-text-muted text-sm">
            No channels yet. Create your first channel to start automating content.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {channels.map(channel => (
            <motion.div
              key={channel.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-2xl border border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14] p-5 transition-all"
            >
              {/* Card header */}
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-dark-text truncate pr-2">{channel.name}</h3>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                    PLATFORM_BADGE_CLASSES[channel.platform] ?? 'bg-white/10 text-white border border-white/20'
                  }`}
                >
                  {channel.platform}
                </span>
              </div>

              {/* Niche */}
              {channel.niche && (
                <p className="text-dark-text-muted text-sm mb-2 truncate">{channel.niche}</p>
              )}

              {/* Frequency badge */}
              <span className="inline-block rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-xs text-dark-text-muted mb-4">
                {FREQUENCY_LABEL[channel.posting_frequency] ?? channel.posting_frequency}
              </span>

              {/* Footer row */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleToggleAutoPost(channel)}
                  className="flex items-center gap-1.5 text-sm transition-colors"
                  title={channel.auto_post ? 'Auto-post on' : 'Auto-post off'}
                >
                  {channel.auto_post ? (
                    <ToggleRight className="h-5 w-5 text-teal-400" />
                  ) : (
                    <ToggleLeft className="h-5 w-5 text-dark-text-muted" />
                  )}
                  <span className={channel.auto_post ? 'text-teal-400' : 'text-dark-text-muted'}>
                    Auto-post
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onOpenPipeline(channel.id)}
                  className="flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-1.5 text-xs text-dark-text-muted hover:border-white/[0.14] hover:text-dark-text transition-all"
                >
                  <Settings className="h-3.5 w-3.5" />
                  Configure Pipeline
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="bg-dark-bg-light border border-glass-border rounded-2xl p-6 w-full max-w-md"
            >
              <h3 className="text-lg font-semibold text-dark-text mb-5">Create Channel</h3>

              <form onSubmit={handleCreate} className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-sm text-dark-text-muted mb-1.5">
                    Channel Name
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="My YouTube Channel"
                    required
                    className={inputClass}
                  />
                </div>

                {/* Platform */}
                <div>
                  <label className="block text-sm text-dark-text-muted mb-1.5">
                    Platform
                  </label>
                  <select
                    value={formPlatform}
                    onChange={e => setFormPlatform(e.target.value)}
                    className={inputClass}
                  >
                    {PLATFORMS.map(p => (
                      <option key={p} value={p}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Niche */}
                <div>
                  <label className="block text-sm text-dark-text-muted mb-1.5">
                    Niche <span className="text-dark-text-muted/60">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={formNiche}
                    onChange={e => setFormNiche(e.target.value)}
                    placeholder="e.g. Personal Finance, Tech Reviews"
                    className={inputClass}
                  />
                </div>

                {/* Frequency */}
                <div>
                  <label className="block text-sm text-dark-text-muted mb-1.5">
                    Posting Frequency
                  </label>
                  <select
                    value={formFrequency}
                    onChange={e => setFormFrequency(e.target.value)}
                    className={inputClass}
                  >
                    {FREQUENCIES.map(f => (
                      <option key={f} value={f}>
                        {FREQUENCY_LABEL[f]}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Auto Post */}
                <div className="flex items-center gap-3">
                  <input
                    id="auto-post-toggle"
                    type="checkbox"
                    checked={formAutoPost}
                    onChange={e => setFormAutoPost(e.target.checked)}
                    className="h-4 w-4 rounded border-white/20 bg-white/[0.02] text-teal-500 focus:ring-teal-500/50"
                  />
                  <label htmlFor="auto-post-toggle" className="text-sm text-dark-text">
                    Enable Auto-post
                  </label>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 rounded-xl border border-white/[0.07] bg-white/[0.02] py-2.5 text-sm text-dark-text-muted hover:border-white/[0.14] hover:text-dark-text transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-400 py-2.5 text-sm font-medium text-dark-bg hover:opacity-90 transition-opacity disabled:opacity-60"
                  >
                    {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                    Create Channel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
