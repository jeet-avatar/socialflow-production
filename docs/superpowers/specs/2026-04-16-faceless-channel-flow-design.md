# Faceless Channel Creation Flow — Design Spec

**Date:** 2026-04-16  
**Project:** SocialFlow  
**Status:** Approved by user  

---

## 1. Problem Statement

SocialFlow's core promise is fully automated faceless content: creator sets up a channel once, AI generates and posts videos. The current UI has no flow that delivers this. The existing UI has a basic modal form (name, platform, niche, frequency, auto_post toggle) with no guidance, no voice selection, no review queue, and no per-channel home. Creators cannot understand how to actually launch and manage a faceless channel.

---

## 2. What We're Building

A complete faceless channel lifecycle:

1. **3-step creation wizard** — niche (with trending suggestions) → platform + frequency → voice
2. **Per-channel home page** — review queue (main) + trending topics sidebar
3. **Auto-post permission gate** — disclaimer-gated, default OFF, creator must explicitly accept

---

## 3. User Flow

```
Dashboard → "New Channel"
  └→ Wizard Step 1: Niche + trending chips
  └→ Wizard Step 2: Platform (YouTube/Instagram/TikTok) + Frequency
  └→ Wizard Step 3: Voice picker (ElevenLabs voices with preview)
  └→ Channel created → navigate to Channel Home Page

Channel Home Page (ongoing)
  ├─ Review Queue (main area)
  │   ├─ Pending videos: Preview | Reject | Approve & Post
  │   ├─ Expired videos (window passed, not posted): Discard | Still post it
  │   └─ Posted history with view/like counts
  └─ Trending Now sidebar
      ├─ Topics filtered to channel niche, refreshed every 6h
      └─ "Make video" button → immediate generation → enters review queue
```

---

## 4. Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auto-post default | OFF | Creator must explicitly opt in |
| Auto-post gate | One-time disclaimer per channel | Legal cover; stored with timestamp |
| Review window expiry | Video stays in queue as **expired** — never auto-posts | Creator has full control |
| Expired video actions | Discard or manually approve late | Flexibility without surprise posts |
| Trending topics source | Google News RSS (feedparser, no API key) | Free, reliable, no rate limits |
| Trending refresh | Every 6h (configurable: 1h / 6h / 24h) | Balance freshness vs. noise |
| "Make video from trend" | Triggers immediate generation → review queue | Creator-initiated, still reviewed |
| Notifications | On generation + 80% window reminder + expiry notice | Keeps creator in the loop |

---

## 5. Data Model Changes

### 5.1 `channels` collection — add fields

```json
{
  "voice_id": "string",                     // ElevenLabs voice ID picked in wizard
  "setup_complete": false,                  // true after wizard completes
  "auto_post_disclaimer_accepted": false,   // true after disclaimer accepted
  "auto_post_disclaimer_accepted_at": null  // ISO timestamp of acceptance
}
```

> `auto_post` (existing) = scheduler cron is active.  
> `auto_post_disclaimer_accepted` = creator has consented to posts without review.  
> Both must be true for true auto-post to activate.

### 5.2 `videos` collection — add fields

```json
{
  "channel_id": "string",           // ObjectId ref to channels collection
  "status": "pending_review",       // enum: pending_review | approved | rejected | posted | expired
  "review_deadline": "ISO datetime",// set when video is generated
  "posted_at": null,                // ISO timestamp when actually posted
  "trending_topic": null,           // if generated from a trend, store the topic string
  "source": "scheduled"             // "scheduled" | "trending_trigger"
}
```

**`status` state machine:**
```
generated → pending_review
pending_review → approved (creator approves)
pending_review → rejected (creator rejects)
pending_review → expired  (review_deadline passed, no action)
approved       → posted   (after platform API call succeeds)
expired        → posted   (creator manually approves late)
expired        → rejected (creator discards)
```

### 5.3 New `channel_disclaimers` collection (optional — can store inline on channel)

Not needed — storing `auto_post_disclaimer_accepted` + `auto_post_disclaimer_accepted_at` directly on the channel document is sufficient.

---

## 6. API Changes

### 6.1 New endpoints in `channel_routes.py`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/channels/{channel_id}/videos` | List videos for a channel. Query param `status` for filtering. |
| `POST` | `/channels/{channel_id}/videos/{video_id}/approve` | Approve video → triggers platform post |
| `POST` | `/channels/{channel_id}/videos/{video_id}/reject` | Reject/discard video |
| `POST` | `/channels/{channel_id}/accept-disclaimer` | Record disclaimer acceptance + enable auto-post |
| `GET` | `/channels/{channel_id}/trending` | Fetch trending topics for channel's niche via Google News RSS |
| `POST` | `/channels/{channel_id}/videos/from-trend` | Generate video from a trending topic → enters review queue |

### 6.2 Update `channel_routes.py` — `ChannelCreate` model

Add `voice_id: Optional[str] = None` to `ChannelCreate`. The wizard sends this on creation.

### 6.3 Update `scheduler.py` — `_run_channel_pipeline`

After `render_video_task` completes:
- Write `channel_id`, `status=pending_review`, `review_deadline=now+review_window_minutes` to videos collection
- Trigger notification to user (in-app + email)

### 6.4 New utility — `utils/trending_service.py`

```python
def get_trending_for_niche(niche: str, max_results: int = 8) -> list[dict]:
    """
    Fetch trending news topics related to a niche via Google News RSS.
    Returns list of {title, url, source, published_at, relevance_score}.
    Uses feedparser. Falls back to empty list on error (non-fatal).
    Query: f"https://news.google.com/rss/search?q={niche}&hl=en-US&gl=US&ceid=US:en"
    """
```

---

## 7. Frontend Components

All new components live under `frontend/src/components/channels/`.

### 7.1 `ChannelWizard.tsx` (new)
- Replaces the create modal in `ChannelDashboard.tsx`
- 3 steps with progress bar
- **Step 1**: `<NicheStep>` — text input + trending chip suggestions (fetched from `/channels/trending-suggestions` with empty niche, uses general news)
- **Step 2**: `<PlatformStep>` — platform card picker + frequency toggle
- **Step 3**: `<VoiceStep>` — ElevenLabs voice cards with Play button (fetches `/content/voice-previews`)
- On submit: `POST /channels/` with `{name, platform, niche, posting_frequency, voice_id}` → navigate to `/channels/{id}`

### 7.2 `ChannelHome.tsx` (new)
- Replaces the current channel card click → analytics tab behaviour
- Full-page view for a single channel
- Layout: left main area (`ReviewQueue`) + right sidebar (`TrendingFeed`)
- Header: channel name, platform badge, active/paused status, settings button

### 7.3 `ReviewQueue.tsx` (new)
- Polls `GET /channels/{id}/videos?status=pending_review,expired` every 30s
- Pending cards: thumbnail, title, script excerpt, countdown timer, Preview | Reject | Approve buttons
- Expired cards: greyed out, "Expired — not posted", Discard | Still Post buttons
- Posted section: collapsed history with view/like counts from analytics

### 7.4 `TrendingFeed.tsx` (new)
- Fetches `GET /channels/{id}/trending` on mount + on refresh interval
- Trending topic cards: title, category tag, "Make video" button
- Refresh picker: 1h / 6h / 24h (stored in localStorage per channel)
- "Make video" → `POST /channels/{id}/videos/from-trend` → optimistic add to review queue

### 7.5 `AutoPostDisclaimer.tsx` (new)
- Modal triggered when creator toggles auto_post ON
- Displays full disclaimer text (legal copy below)
- Checkbox required before "Enable Auto-Post" button activates
- On confirm: `POST /channels/{id}/accept-disclaimer` → updates channel state

### 7.6 `VideoPreviewModal.tsx` (new)
- Inline modal: plays the Remotion-rendered video URL
- Simple `<video>` tag + close button
- Fetched from video record's `output_url` field

### 7.7 Updates to `ChannelDashboard.tsx`
- Replace "New Channel" modal with `<ChannelWizard>`
- Channel cards: clicking a channel navigates to `ChannelHome` instead of opening PipelineBuilder inline
- PipelineBuilder accessible via Settings button inside ChannelHome

---

## 8. Disclaimer Legal Copy

> **Auto-Post Disclaimer**  
> SocialFlow generates video content using artificial intelligence. We cannot guarantee the accuracy, appropriateness, completeness, or legality of AI-generated content. By enabling auto-post, you accept full and sole responsibility for all content published to your social media channel(s). SocialFlow, its affiliates, and its employees are not liable for any claims, damages, losses, or actions arising from content auto-posted on your behalf. You may disable auto-post at any time from your channel settings.

---

## 9. Notification Flow

| Trigger | Message | Channel |
|---------|---------|---------|
| Video generated | "New video ready — approve to post to [Platform]" | In-app + email |
| 80% of review window elapsed | "Your video approval expires in [X] min" | In-app |
| Review window expired | "Video not posted — still in your review queue" | In-app |
| Video posted successfully | "Your video is live on [Platform]!" | In-app + email |

Notifications stored in `notifications` collection (already exists in DB init). Email via existing `/auth/notify-login` pattern using SMTP.

---

## 10. Trending Topics — Technical Approach

**Source:** Google News RSS  
**Library:** `feedparser` (already common in Python; add to requirements.txt)  
**Endpoint:** `https://news.google.com/rss/search?q={niche}&hl=en-US&gl=US&ceid=US:en`  
**Caching:** Redis with 6h TTL, key = `trending:{niche_slug}`  
**Fallback:** Empty list if fetch fails — non-fatal, sidebar shows "No trends available right now"

---

## 11. What Is NOT in This Phase

- Platform OAuth (YouTube/Instagram/TikTok API credentials) — `approve` endpoint stores the record; actual posting to platforms is a follow-on phase
- Push notifications (mobile) — email + in-app only
- Multi-language voice support
- Analytics on trend-triggered vs scheduled videos

---

## 12. Files Changed / Created

### New files
- `frontend/src/components/channels/ChannelWizard.tsx`
- `frontend/src/components/channels/ChannelHome.tsx`
- `frontend/src/components/channels/ReviewQueue.tsx`
- `frontend/src/components/channels/TrendingFeed.tsx`
- `frontend/src/components/channels/AutoPostDisclaimer.tsx`
- `frontend/src/components/channels/VideoPreviewModal.tsx`
- `backend/app/utils/trending_service.py`

### Modified files
- `frontend/src/components/channels/ChannelDashboard.tsx` — swap modal for wizard, card click → ChannelHome
- `frontend/src/App.tsx` — add `/channels/:id` route → ChannelHome
- `backend/app/routes/channel_routes.py` — new endpoints (videos, approve, reject, disclaimer, trending, from-trend)
- `backend/app/worker/scheduler.py` — write video record with status/deadline after render
- `backend/app/requirements.txt` — add `feedparser`
