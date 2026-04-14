import React, { useEffect, useState, useCallback } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { getAuthHeaders } from '../../utils/getAuthToken';
import { API_BASE_URL } from '../../config/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PostStats {
  views: number;
  likes: number;
  comments: number;
}

interface PlatformPost {
  id: string;
  channel_id: string;
  platform: string;
  platform_video_id: string;
  posted_at: string;
  last_fetched_at: string | null;
  stats: PostStats;
}

interface ChartPoint {
  date: string;
  views: number;
  likes: number;
  comments: number;
  platform: string;
}

interface ChannelAnalyticsProps {
  channelId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isTikTok(post: PlatformPost): boolean {
  return post.platform === 'tiktok';
}

function statsAvailable(post: PlatformPost): boolean {
  return !isTikTok(post);
}

function buildChartData(posts: PlatformPost[]): ChartPoint[] {
  return posts
    .filter(statsAvailable)
    .map((p) => ({
      date:     formatDate(p.posted_at),
      views:    p.stats?.views    ?? 0,
      likes:    p.stats?.likes    ?? 0,
      comments: p.stats?.comments ?? 0,
      platform: p.platform,
    }))
    .reverse(); // Oldest first for chronological chart
}

// ── Component ─────────────────────────────────────────────────────────────────

const CHART_STYLE = {
  background: '#0d0d14',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '6px',
  padding: '8px 12px',
  color: '#e5e7eb',
};

export function ChannelAnalytics({ channelId }: ChannelAnalyticsProps) {
  const [posts, setPosts]       = useState<PlatformPost[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/analytics/${channelId}/posts`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PlatformPost[] = await res.json();
      setPosts(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    if (channelId) fetchPosts();
  }, [channelId, fetchPosts]);

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/analytics/${channelId}/refresh`, {
        method: 'POST',
        headers,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchPosts(); // Reload with updated stats
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  };

  const chartData = buildChartData(posts);
  const tiktokCount = posts.filter(isTikTok).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
        Loading analytics...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-48 text-red-400 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold text-base">Channel Performance</h3>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="px-3 py-1.5 text-xs rounded-md bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white transition-colors"
        >
          {refreshing ? 'Refreshing...' : 'Refresh Stats'}
        </button>
      </div>

      {/* Empty state */}
      {posts.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-gray-500 text-sm space-y-2">
          <span>No posts yet for this channel.</span>
          <span className="text-xs">Stats will appear once videos are published.</span>
        </div>
      )}

      {/* TikTok notice */}
      {tiktokCount > 0 && (
        <p className="text-xs text-gray-500">
          {tiktokCount} TikTok post{tiktokCount > 1 ? 's' : ''} — stats not available
          (TikTok Content API does not expose view counts).
        </p>
      )}

      {/* Views + Likes line chart */}
      {chartData.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 mb-2">Views &amp; Likes Over Time</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="date"
                stroke="#6b7280"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
              />
              <YAxis
                stroke="#6b7280"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
              />
              <Tooltip contentStyle={CHART_STYLE} labelStyle={{ color: '#e5e7eb' }} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
              <Line
                type="monotone"
                dataKey="views"
                stroke="#14b8a6"
                dot={false}
                strokeWidth={2}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="likes"
                stroke="#3b82f6"
                dot={false}
                strokeWidth={2}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Comments bar chart */}
      {chartData.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 mb-2">Comments Per Post</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="date"
                stroke="#6b7280"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
              />
              <YAxis
                stroke="#6b7280"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
              />
              <Tooltip contentStyle={CHART_STYLE} labelStyle={{ color: '#e5e7eb' }} />
              <Bar dataKey="comments" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Posts table */}
      {posts.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-gray-400 border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-gray-500">
                <th className="text-left py-2 pr-4">Platform</th>
                <th className="text-left py-2 pr-4">Posted</th>
                <th className="text-right py-2 pr-4">Views</th>
                <th className="text-right py-2 pr-4">Likes</th>
                <th className="text-right py-2">Comments</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-1.5 pr-4 capitalize">{p.platform}</td>
                  <td className="py-1.5 pr-4">{formatDate(p.posted_at)}</td>
                  {isTikTok(p) ? (
                    <td colSpan={3} className="py-1.5 text-center text-gray-600 italic">
                      N/A
                    </td>
                  ) : (
                    <>
                      <td className="py-1.5 pr-4 text-right">{(p.stats?.views ?? 0).toLocaleString()}</td>
                      <td className="py-1.5 pr-4 text-right">{(p.stats?.likes ?? 0).toLocaleString()}</td>
                      <td className="py-1.5 text-right">{(p.stats?.comments ?? 0).toLocaleString()}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default ChannelAnalytics;
