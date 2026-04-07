import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config/api';
import { getAuthToken } from '../utils/getAuthToken';
import { Play, Download, Search, Calendar, Clock, Eye, Video, RefreshCw, X, XCircle } from 'lucide-react';

interface Video {
  _id: string;
  company_name: string;
  video_url: string;
  s3_key: string;
  s3_bucket: string;
  thumbnail_url?: string;
  client_logo_url?: string;
  title: string;
  description: string;
  narration_text: string;
  duration?: number;
  file_size?: number;
  status: string;
  created_at: string;
  updated_at: string;
  tags?: string[];
  views: number;
  downloads: number;
  shares: number;
}

interface VideoStats {
  total_videos: number;
  completed: number;
  processing: number;
  failed: number;
  total_duration_minutes: number;
  total_file_size_mb: number;
  total_views: number;
  total_downloads: number;
}

const MyVideos: React.FC = () => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [stats, setStats] = useState<VideoStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchVideos();
    fetchStats();
  }, []);

  const fetchVideos = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getAuthToken();
      const response = await fetch(`${API_BASE_URL}/videos/`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setVideos(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to fetch videos');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${API_BASE_URL}/videos/stats`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();
      setStats(data.stats);
    } catch {
      // stats load failed silently
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      fetchVideos();
      return;
    }

    try {
      setLoading(true);
      const token = await getAuthToken();
      const response = await fetch(`${API_BASE_URL}/videos/search/${searchQuery}`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();
      setVideos(data);
    } catch {
      // search failed silently
    } finally {
      setLoading(false);
    }
  };

  const trackAnalytics = async (videoId: string, action: 'view' | 'download' | 'share') => {
    try {
      const token = await getAuthToken();
      const analyticsData = {
        increment_views: action === 'view',
        increment_downloads: action === 'download',
        increment_shares: action === 'share'
      };
      
      await fetch(`${API_BASE_URL}/videos/${videoId}/analytics`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(analyticsData)
      });
    } catch {
      // analytics tracking failed silently
    }
  };


  const handleDownload = async (video: Video) => {
    try {
      await trackAnalytics(video._id, 'download');

      if (!video.video_url) throw new Error('Video URL not found');

      const filename = `${(video.title || video.company_name || 'video')
        .replaceAll(/[^\w\s-]/g, '')
        .replaceAll(/\s+/g, '_')}.mp4`;

      const proxyUrl = `${API_BASE_URL}/videos/proxy-download?url=${encodeURIComponent(video.video_url)}&filename=${encodeURIComponent(filename)}`;
      const a = document.createElement('a');
      a.href = proxyUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setVideos(videos.map(v =>
        v._id === video._id ? { ...v, downloads: v.downloads + 1 } : v
      ));
    } catch (error) {
      alert(`Failed to download video: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const openVideoModal = async (video: Video) => {
    setSelectedVideo(video);
    setShowVideoModal(true);
    
    // Track view analytics
    await trackAnalytics(video._id, 'view');
    
    // Update local state
    setVideos(videos.map(v => 
      v._id === video._id ? { ...v, views: v.views + 1 } : v
    ));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };


  return (
    <div className="space-y-6">

      {/* ── Page Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-text">My Videos</h1>
          <p className="mt-1 text-xs text-dark-text-muted/80">Manage and view all your generated videos</p>
        </div>
        <div className="flex items-center gap-3">
          {stats && (
            <div className="flex items-center space-x-2 px-4 py-2 rounded-md font-medium bg-accent-teal/15 text-accent-teal border border-accent-teal/25">
              <Video className="h-4 w-4" />
              <span>{stats.total_videos} videos</span>
            </div>
          )}
          <button
            onClick={() => { fetchVideos(); fetchStats(); }}
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 rounded-md font-medium bg-gradient-teal-blue text-white border border-white/10 hover:opacity-90 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="glass-card bg-accent-pink/10 border-accent-pink/30 p-4 flex items-start space-x-3">
          <div className="w-10 h-10 bg-accent-pink rounded-xl flex items-center justify-center flex-shrink-0">
            <XCircle className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-accent-pink font-medium text-sm">{error}</p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { setError(null); fetchVideos(); }}
                className="px-4 py-1.5 text-xs font-semibold bg-accent-pink/20 text-accent-pink rounded-lg hover:bg-accent-pink/30 transition-all border border-accent-pink/30"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Search Bar ── */}
      <div className="glass-panel">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-text-muted w-4 h-4" />
            <input
              type="text"
              placeholder="Search by title, company, or tag…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="input-glass w-full h-[44px] pl-10 pr-4"
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-6 h-[44px] bg-gradient-teal-blue text-white rounded-xl font-semibold hover:opacity-90 transition-all flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            <span>Search</span>
          </button>
        </div>
      </div>

      {/* ── Video Grid ── */}
      {loading && (
        <div className="glass-panel flex justify-center items-center py-16">
          <RefreshCw className="h-8 w-8 text-accent-blue animate-spin" />
        </div>
      )}
      {!loading && videos.length === 0 && (
        <div className="glass-panel py-16 text-center">
          <div className="w-20 h-20 bg-gradient-teal-blue rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-glow-teal">
            <Video className="w-10 h-10 text-white" />
          </div>
          <h3 className="text-lg font-semibold text-dark-text mb-2">No videos yet</h3>
          <p className="text-sm text-dark-text-muted">Generate your first video from the Campaign page.</p>
        </div>
      )}
      {!loading && videos.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {videos.map((video) => {
            const initials = video.company_name
              ? video.company_name.split(' ').filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('')
              : 'V';
            const shortDate = new Date(video.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

            return (
              <div key={video._id} className="glass-card overflow-hidden p-0 group">

                {/* ── Thumbnail (16:9) ── */}
                <button
                  type="button"
                  className="relative aspect-video overflow-hidden w-full bg-gradient-to-br from-gray-900 via-[#0f172a] to-gray-900"
                  onClick={() => openVideoModal(video)}
                >
                  {/* Subtle radial glow */}
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgba(20,184,166,0.12),transparent_65%)]" />

                  {/* Centered company logo or initials fallback */}
                  {(() => {
                    const isDefaultLogo = !video.client_logo_url || video.client_logo_url.includes('freepik.com');
                    return (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                        {isDefaultLogo ? (
                          <div className="w-16 h-16 bg-gradient-teal-blue rounded-2xl flex items-center justify-center shadow-glow-teal">
                            <span className="text-2xl font-bold text-white leading-none">{initials}</span>
                          </div>
                        ) : (
                          <img
                            src={video.client_logo_url}
                            alt={video.company_name}
                            className="w-24 h-24 object-contain rounded-2xl bg-white/5 p-2"
                            onError={(e) => {
                              const el = e.target as HTMLImageElement;
                              el.style.display = 'none';
                              const fallback = el.previousElementSibling as HTMLElement;
                              if (fallback) fallback.style.display = 'flex';
                            }}
                          />
                        )}
                        {video.company_name && (
                          <span className="text-xs text-white/50 font-medium tracking-wide">{video.company_name}</span>
                        )}
                      </div>
                    );
                  })()}

                  {/* Hover overlay — actions */}
                  <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); openVideoModal(video); }}
                      className="w-12 h-12 bg-gradient-teal-blue rounded-full flex items-center justify-center shadow-glow-teal hover:scale-110 transition-transform"
                      title="Play"
                    >
                      <Play className="w-5 h-5 text-white ml-0.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDownload(video); }}
                      className="w-10 h-10 bg-white/15 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/25 transition-all"
                      title="Download"
                    >
                      <Download className="w-4 h-4 text-white" />
                    </button>
                  </div>

                  {/* Duration badge */}
                  {video.duration ? (
                    <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 bg-black/60 text-white text-xs font-mono rounded backdrop-blur-sm">
                      {formatDuration(video.duration)}
                    </div>
                  ) : null}
                </button>

                {/* ── Info bar ── */}
                <div className="px-4 py-3 space-y-1.5">
                  <h3 className="font-semibold text-dark-text truncate text-sm leading-snug">{video.title}</h3>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-xs text-dark-text-muted">
                      <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{shortDate}</span>
                      {video.views > 0 && <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{video.views}</span>}
                      {video.downloads > 0 && <span className="flex items-center gap-1"><Download className="w-3.5 h-3.5" />{video.downloads}</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Video Modal ── */}
      {showVideoModal && selectedVideo && (() => {
        const v = selectedVideo;
        const modalInitials = v.company_name
          ? v.company_name.split(' ').filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('')
          : 'V';
        const isDefaultLogo = !v.client_logo_url || v.client_logo_url.includes('freepik.com');
        return (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="relative max-w-3xl w-full">

              {/* Close button — floating just outside right edge of panel */}
              <button
                onClick={() => setShowVideoModal(false)}
                className="absolute top-0 left-full ml-3 w-10 h-10 bg-white/10 backdrop-blur-md border border-white/20 rounded-full flex items-center justify-center hover:bg-white/20 transition-all"
              >
                <X className="h-5 w-5 text-white" />
              </button>

              <div className="glass-panel w-full max-h-[90vh] overflow-y-auto">

                {/* Thumbnail-style header with video player on top */}
                <div className="relative aspect-video overflow-hidden rounded-xl mb-5 bg-gradient-to-br from-gray-900 via-[#0f172a] to-gray-900">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgba(20,184,166,0.12),transparent_65%)]" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    {isDefaultLogo ? (
                      <div className="w-16 h-16 bg-gradient-teal-blue rounded-2xl flex items-center justify-center shadow-glow-teal">
                        <span className="text-2xl font-bold text-white leading-none">{modalInitials}</span>
                      </div>
                    ) : (
                      <img
                        src={v.client_logo_url}
                        alt={v.company_name}
                        className="w-24 h-24 object-contain rounded-2xl bg-white/5 p-2"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    {v.company_name && (
                      <span className="text-sm text-white/60 font-medium tracking-wide">{v.company_name}</span>
                    )}
                  </div>
                  <video
                    controls
                    className="absolute inset-0 w-full h-full object-contain"
                    src={v.video_url}
                  >
                    <track kind="captions" />
                  </video>
                  {v.duration ? (
                    <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 bg-black/60 text-white text-xs font-mono rounded backdrop-blur-sm z-10">
                      {formatDuration(v.duration)}
                    </div>
                  ) : null}
                </div>

                {/* Title */}
                <div className="mb-4">
                  <h2 className="text-xl font-bold text-dark-text">{v.title}</h2>
                  {v.company_name && <p className="text-sm text-accent-blue mt-0.5">{v.company_name}</p>}
                </div>

                {/* Details */}
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-4 text-sm glass-card p-3">
                    {v.views > 0 && <span className="flex items-center gap-2 text-dark-text-muted"><Eye className="w-4 h-4" />{v.views} views</span>}
                    {v.downloads > 0 && <span className="flex items-center gap-2 text-dark-text-muted"><Download className="w-4 h-4" />{v.downloads} downloads</span>}
                    <span className="flex items-center gap-2 text-dark-text-muted"><Calendar className="w-4 h-4" />{formatDate(v.created_at)}</span>
                    {v.duration && <span className="flex items-center gap-2 text-dark-text-muted"><Clock className="w-4 h-4" />{formatDuration(v.duration)}</span>}
                  </div>
                  {v.description && (
                    <div className="glass-card p-4">
                      <h3 className="text-sm font-semibold text-dark-text mb-2">Description</h3>
                      <p className="text-sm text-dark-text-muted leading-relaxed">{v.description}</p>
                    </div>
                  )}
                  {v.narration_text && (
                    <div className="glass-card p-4">
                      <h3 className="text-sm font-semibold text-dark-text mb-2">Video Script</h3>
                      <p className="text-sm text-dark-text-muted leading-relaxed italic">{v.narration_text}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default MyVideos;
