import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Settings, ToggleLeft, ToggleRight, Loader2, BarChart2 } from 'lucide-react';
import { getAuthHeaders } from '../../utils/getAuthToken';
import { API_BASE_URL } from '../../config/api';
import { ChannelAnalytics } from './ChannelAnalytics';
import ChannelWizard from './ChannelWizard';

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

interface ChannelDashboardProps {
  onOpenPipeline: (channelId: string) => void;
  onOpenChannelHome: (channelId: string) => void;
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

export default function ChannelDashboard({ onOpenPipeline, onOpenChannelHome }: ChannelDashboardProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [activeTab, setActiveTab] = useState<'channels' | 'analytics'>('channels');
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

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

  useEffect(() => {
    const open = () => setShowWizard(true);
    globalThis.addEventListener('openChannelWizard', open);
    return () => globalThis.removeEventListener('openChannelWizard', open);
  }, []);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-dark-text">Channels</h2>
        <button
          onClick={() => setShowWizard(true)}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-400 px-4 py-2 text-sm font-medium text-dark-bg hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          New Channel
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-white/[0.07]">
        <button
          onClick={() => setActiveTab('channels')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'channels'
              ? 'text-teal-400 border-b-2 border-teal-400'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          Channels
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'analytics'
              ? 'text-teal-400 border-b-2 border-teal-400'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          Analytics
        </button>
      </div>

      {/* Analytics tab content */}
      {activeTab === 'analytics' && (
        <div className="p-4">
          {selectedChannelId ? (
            <ChannelAnalytics channelId={selectedChannelId} />
          ) : (
            <p className="text-gray-500 text-sm text-center py-8">
              Select a channel to view analytics.
            </p>
          )}
        </div>
      )}

      {/* Channels tab body */}
      {activeTab === 'channels' && loading ? (
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
              onClick={() => onOpenChannelHome(channel.id)}
              className="rounded-2xl border border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14] p-5 transition-all cursor-pointer"
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
                  onClick={(e) => { e.stopPropagation(); handleToggleAutoPost(channel); }}
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

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSelectedChannelId(channel.id); setActiveTab('analytics'); }}
                    className="flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-1.5 text-xs text-dark-text-muted hover:border-white/[0.14] hover:text-dark-text transition-all"
                  >
                    <BarChart2 className="h-3.5 w-3.5" />
                    Analytics
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpenPipeline(channel.id); }}
                    className="flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-1.5 text-xs text-dark-text-muted hover:border-white/[0.14] hover:text-dark-text transition-all"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    Configure Pipeline
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Channel Wizard (new flow) */}
      <AnimatePresence>
        {showWizard && (
          <ChannelWizard
            onCreated={(channelId) => {
              setShowWizard(false);
              onOpenChannelHome(channelId);
            }}
            onCancel={() => setShowWizard(false)}
          />
        )}
      </AnimatePresence>

    </div>
  );
}
