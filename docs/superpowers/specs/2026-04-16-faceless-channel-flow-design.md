# Faceless Channel Creation Flow — Design Spec

**Date:** 2026-04-16  
**Project:** SocialFlow  
**Status:** Approved by user — spec reviewed and issues resolved  

---

## 1. Problem Statement

SocialFlow's core promise is fully automated faceless content: creator sets up a channel once, AI generates and posts videos. The current UI has no flow that delivers this. The existing UI has a basic modal form (name, platform, niche, frequency, auto_post toggle) with no guidance, no voice selection, no review queue, and no per-channel home. Creators cannot understand how to actually launch and manage a faceless channel.

---

## 2. What We're Building

A complete faceless channel lifecycle:

1. **3-step creation wizard** — niche (with trending suggestions) → platform + frequency → voice
2. **Per-channel home panel** — review queue (main) + trending topics sidebar
3. **Auto-post permission gate** — disclaimer-gated, default OFF, creator must explicitly accept

---

## 3. User Flow

```
Dashboard → "New Channel"
  └→ Wizard Step 1: Niche + trending chips (fetched from /channels/trending-suggestions, no auth needed)
  └→ Wizard Step 2: Platform (YouTube/Instagram/TikTok) + Frequency
  └→ Wizard Step 3: Voice picker (ElevenLabs voices with name + preview audio)
  └→ Channel created (POST /channels/) → POST /model-config/ with voice_id
  └→ Channel panel opens inside Dashboard (no routing library needed)

Channel Home Panel (ongoing, shown when a channel card is clicked)
  ├─ Review Queue (main area)
  │   ├─ Pending videos: Preview | Reject | Approve (sets status=approved, no posting yet)
  │   ├─ Expired videos (window passed, not posted): Discard | Still approve it
  │   └─ Posted history with view/like counts
  └─ Trending Now sidebar
      ├─ Topics filtered to channel niche, refreshed every 6h
      └─ "Make video" button → immediate generation → enters queued_videos as pending_review
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
| Trending refresh | Every 6h (configurable: 1h / 6h / 24h) | Balance freshness vs noise |
| "Make video from trend" | Triggers immediate generation → review queue | Creator-initiated, still reviewed |
| Notifications | On generation + 80% window reminder + expiry notice | Keeps creator in the loop |
| ChannelHome navigation | Panel within Dashboard (no React Router) | App has no router; avoids new dependency |
| voice_id storage | In `model_configs` collection via existing `/model-config/` endpoint | Aligns with `resolve_model_config()` used by scheduler |
| Review queue collection | `queued_videos` (existing, purpose-built) | Has channel_id index already; `videos` collection is for completed records only |
| Approve in this phase | Sets `status=approved` only — actual platform posting is deferred | Platform OAuth not yet wired |

---

## 5. Data Model Changes

### 5.1 `channels` collection — add fields

```json
{
  "setup_complete": false,                  // true after wizard completes
  "auto_post_disclaimer_accepted": false,   // true after disclaimer accepted
  "auto_post_disclaimer_accepted_at": null  // ISO timestamp of acceptance
}
```

> `auto_post` (existing) = scheduler cron is active.  
> `auto_post_disclaimer_accepted` = creator has accepted responsibility for auto-posting.  
> `voice_id` is NOT stored here — it lives in `model_configs` keyed by `(user_id, channel_id)`.

### 5.2 `queued_videos` collection — add fields (use existing collection)

The `queued_videos` collection already exists in `db_init.py` with `channel_id + status` index. Add these fields to the documents written by the scheduler and trending trigger:

```json
{
  "channel_id": "string",           // ObjectId ref — already in collection
  "status": "pending_review",       // already in collection — confirm enum values below
  "review_deadline": "ISO datetime",// new: set when video enters queue
  "posted_at": null,                // new: ISO timestamp when platform post succeeds
  "trending_topic": null,           // new: topic string if source=trending_trigger
  "source": "scheduled"             // new: "scheduled" | "trending_trigger"
}
```

**`status` state machine (clarified):**
```
generated → pending_review
pending_review → approved    (creator taps Approve — no post yet, just status change)
pending_review → rejected    (creator taps Reject)
pending_review → expired     (review_deadline passes, APScheduler expiry job fires)
approved       → posted      (future phase: platform OAuth wired, posting succeeds)
expired        → approved    (creator manually approves late)
expired        → rejected    (creator discards)
```

### 5.3 `notifications` collection — new, add to `db_init.py`

```python
# In db_init.py init_collections():
db.create_collection("notifications") if "notifications" not in db.list_collection_names() else None
db["notifications"].create_index([("user_id", 1), ("created_at", -1)])
db["notifications"].create_index([("read", 1)])
```

Document shape:
```json
{
  "user_id": "string",
  "channel_id": "string",
  "video_id": "string",
  "type": "video_ready | review_reminder | review_expired | video_posted",
  "message": "string",
  "read": false,
  "created_at": "ISO datetime"
}
```

---

## 6. API Changes

### 6.1 New endpoints in `channel_routes.py`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/channels/trending-suggestions` | None required | General trending topics (no niche filter). Used in wizard Step 1 before channel exists. Calls `trending_service.get_trending_for_niche("")` with empty niche → returns top news. |
| `GET` | `/channels/{channel_id}/videos` | User owns channel | List queued_videos for channel. Query param `?status=pending_review,expired`. Verifies `channel.user_id == user_id`. |
| `POST` | `/channels/{channel_id}/videos/{video_id}/approve` | User owns channel | Sets `queued_videos.status = approved`, `approved_at = now()`. Verifies `channel.user_id == user_id` AND `video.channel_id == channel_id`. Does NOT post to platform (deferred). |
| `POST` | `/channels/{channel_id}/videos/{video_id}/reject` | User owns channel | Sets `queued_videos.status = rejected`. Same ownership checks as approve. |
| `POST` | `/channels/{channel_id}/accept-disclaimer` | User owns channel | Sets `auto_post_disclaimer_accepted=true`, `auto_post_disclaimer_accepted_at=now()` on channel. Also sets `auto_post=true`. |
| `GET` | `/channels/{channel_id}/trending` | User owns channel | Fetch trending topics for channel's niche via Google News RSS. Cached in Redis 6h. |
| `POST` | `/channels/{channel_id}/videos/from-trend` | User owns channel | Body: `{topic: string}`. Triggers immediate content generation for the topic → writes to `queued_videos` as `pending_review`. Dispatches `render_video_task` via Celery. |

### 6.2 Update `channel_routes.py` — `ChannelCreate` model

No change needed. `voice_id` is NOT sent to `POST /channels/`. The wizard calls `POST /model-config/` as a second step after channel creation.

**Wizard creation sequence:**
1. `POST /channels/` with `{name, platform, niche, posting_frequency}` → returns `{id, ...}`
2. `POST /model-config/` with `{channel_id, voice_provider: "elevenlabs", voice_id}` → stores in `model_configs`
3. Set `setup_complete=true` via `PUT /channels/{id}` with `{setup_complete: true}`

### 6.3 Update `scheduler.py` — `_run_channel_pipeline`

After `render_video_task.delay(...)`, write to `queued_videos`:
```python
db["queued_videos"].insert_one({
    "channel_id": channel_id,
    "user_id": user_id,
    "job_id": job_id,
    "status": "pending_review",
    "review_deadline": datetime.now(timezone.utc) + timedelta(minutes=ch.get("review_window_minutes", 60)),
    "source": "scheduled",
    "trending_topic": None,
    "created_at": datetime.now(timezone.utc),
})
```

Then dispatch a Celery countdown task for the 80% reminder:
```python
from worker.notification_tasks import send_review_reminder
window_minutes = ch.get("review_window_minutes", 60)
send_review_reminder.apply_async(
    args=[user_id, channel_id, job_id],
    countdown=int(window_minutes * 0.8 * 60)  # 80% of window in seconds
)
```

To resolve user email from `user_id` in notification tasks:
```python
from utils.user_service import user_service
user = user_service.get_user_by_supabase_id(user_id)
to_email = user.get("email") if user else None
```

### 6.4 New `worker/notification_tasks.py` (Celery task)

```python
@celery_app.task
def send_review_reminder(user_id: str, channel_id: str, job_id: str):
    """Fires at 80% of review window — sends in-app + email reminder."""
    # 1. Look up user email via user_service
    # 2. Check video still in pending_review (skip if already approved/rejected)
    # 3. Write to notifications collection
    # 4. Send email via notifications.py send_notification()
```

### 6.5 New utility — `utils/trending_service.py`

```python
import feedparser, redis
from urllib.parse import quote_plus

CACHE_TTL = 6 * 3600  # 6 hours

def get_trending_for_niche(niche: str, max_results: int = 8) -> list[dict]:
    """
    Fetch trending news via Google News RSS. Cached in Redis.
    Returns: [{title, url, source, published_at}]
    Falls back to [] on error (non-fatal).
    """
    cache_key = f"trending:{niche[:80]}"
    # check Redis cache first
    # if miss: fetch https://news.google.com/rss/search?q={quote_plus(niche)}&hl=en-US&gl=US&ceid=US:en
    # parse with feedparser, extract entries[:max_results]
    # store in Redis with CACHE_TTL
    # return list of dicts
```

**Dependencies to add to `backend/app/requirements.txt`:**
- `feedparser` (Google News RSS parsing — not currently in requirements.txt)

---

## 7. Frontend Components

All new components live under `frontend/src/components/channels/`.

**Navigation model:** No React Router. `ChannelHome` renders as a panel inside `Dashboard.tsx`, toggled by a `selectedChannel` state variable — same pattern as how `PipelineBuilder` currently works (`activePipelineChannel`).

### 7.1 `ChannelWizard.tsx` (new)
- Replaces the create modal in `ChannelDashboard.tsx`
- 3 steps with progress bar
- **Step 1 `<NicheStep>`**: text input + trending chip suggestions fetched from `GET /channels/trending-suggestions` (no auth needed, general news). Chips are amber-coloured; clicking one fills the input.
- **Step 2 `<PlatformStep>`**: platform card picker (YouTube/Instagram/TikTok) + frequency toggle (Daily / 3×/wk / Weekly)
- **Step 3 `<VoiceStep>`**: voice cards fetched from enhanced `GET /content/voice-previews` (see §7.6). Each card shows name, description, Play button.
- **On submit:**
  1. `POST /channels/` with `{name, platform, niche, posting_frequency}` → get `channel.id`
  2. `POST /model-config/` with `{channel_id, voice_provider: "elevenlabs", voice_id}`
  3. `PUT /channels/{id}` with `{setup_complete: true}`
  4. Calls `onChannelCreated(channel.id)` → parent shows `ChannelHome` for new channel

### 7.2 `ChannelHome.tsx` (new)
- Rendered inside `Dashboard.tsx` via `selectedChannel` state (no router)
- Layout: left main area (`ReviewQueue`) + right sidebar (`TrendingFeed`)
- Header: channel name, platform badge, active/paused status, Settings button (opens existing PipelineBuilder)
- Auto-post toggle wired to `AutoPostDisclaimer`

### 7.3 `ReviewQueue.tsx` (new)
- Polls `GET /channels/{id}/videos?status=pending_review,expired` every 30s
- Pending cards: thumbnail, title, script excerpt, countdown timer, Preview | Reject | Approve buttons
- Approve calls `POST /channels/{id}/videos/{vid}/approve`; Reject calls `.../reject`
- Expired cards: greyed out, "Expired — not posted", Discard | Still Approve buttons
- Posted section: collapsed history

### 7.4 `TrendingFeed.tsx` (new)
- Fetches `GET /channels/{id}/trending` on mount + on refresh interval
- Trending topic cards: title, category, "Make video" button
- "Make video" → `POST /channels/{id}/videos/from-trend` with `{topic}` → adds to review queue
- Refresh interval picker: 1h / 6h / 24h (stored in `localStorage` per channel)

### 7.5 `AutoPostDisclaimer.tsx` (new)
- Modal triggered when creator toggles auto_post ON and `auto_post_disclaimer_accepted` is false
- Full disclaimer text (Section 8)
- Checkbox required before "Enable Auto-Post" button activates
- On confirm: `POST /channels/{id}/accept-disclaimer`

### 7.6 `VideoPreviewModal.tsx` (new)
- Inline modal: `<video>` tag playing `output_url` from queued_video record
- Simple close button

### 7.7 Update `GET /content/voice-previews` response shape

The existing endpoint returns `{previews: {voice_id: preview_url}}` — no voice names. Update to include name and description by calling the ElevenLabs `/v1/voices` endpoint and returning:

```json
{
  "voices": [
    {"voice_id": "...", "name": "Adam", "description": "Deep · Professional", "preview_url": "..."},
    ...
  ]
}
```

This requires updating `content_routes.py:get_voice_previews()` to also fetch `name` and `labels` from the ElevenLabs voices response.

### 7.8 Updates to `ChannelDashboard.tsx`
- Replace "New Channel" modal with `<ChannelWizard>`
- Channel card click → sets `selectedChannel` → renders `<ChannelHome>` (same pattern as `activePipelineChannel`)
- `PipelineBuilder` remains accessible via Settings button inside `ChannelHome`

### 7.9 Updates to `Dashboard.tsx`
- Add `selectedChannel: string | null` state alongside existing `activePipelineChannel`
- When `selectedChannel` is set, render `<ChannelHome channelId={selectedChannel} onBack={() => setSelectedChannel(null)} />`

---

## 8. Disclaimer Legal Copy

> **Auto-Post Disclaimer**  
> SocialFlow generates video content using artificial intelligence. We cannot guarantee the accuracy, appropriateness, completeness, or legality of AI-generated content. By enabling auto-post, you accept full and sole responsibility for all content published to your social media channel(s). SocialFlow, its affiliates, and its employees are not liable for any claims, damages, losses, or actions arising from content auto-posted on your behalf. You may disable auto-post at any time from your channel settings.

---

## 9. Notification Flow

| Trigger | Message | Channels | How implemented |
|---------|---------|---------|----------------|
| Video generated | "New video ready — approve to post to [Platform]" | In-app + email | `scheduler.py` after writing to `queued_videos` |
| 80% of review window | "Your video approval expires in [X] min" | In-app + email | Celery countdown task `send_review_reminder` |
| Review window expired | "Video not posted — still in your review queue" | In-app | APScheduler expiry sweep or Celery countdown at 100% |
| Video approved | "Video approved — will post when OAuth is configured" | In-app | `approve` endpoint |

Email path: Celery/scheduler tasks call `user_service.get_user_by_supabase_id(user_id)` to resolve `to_email`, then `notifications.send_notification()`.

In-app: write to `notifications` collection (new, added to `db_init.py`). Frontend polls `GET /notifications/unread` (new simple endpoint).

---

## 10. Trending Topics — Technical Approach

**Source:** Google News RSS  
**Library:** `feedparser` — add to `backend/app/requirements.txt` (currently absent)  
**Endpoint:** `https://news.google.com/rss/search?q={quote_plus(niche)}&hl=en-US&gl=US&ceid=US:en`  
**Caching:** Redis with 6h TTL, key = `trending:{niche_slug}`  
**Fallback:** Empty list if fetch fails — non-fatal, sidebar shows "No trends available right now"  
**Empty niche:** When `niche=""` (wizard Step 1, no niche typed yet), fetch top general news: `q=trending+news+today`

---

## 11. What Is NOT in This Phase

- Actual platform posting (YouTube/Instagram/TikTok OAuth) — `approve` sets status only; posting deferred
- Push notifications (mobile) — email + in-app only
- Multi-language voice support
- Analytics on trend-triggered vs scheduled videos

---

## 12. Files Changed / Created

> **Scope note:** All items below are implementation tasks. Source files are NOT pre-modified — section 12 is the authoritative list of changes the execution phase must make. Pre-existing source files (db_init.py, requirements.txt, content_routes.py, ChannelDashboard.tsx, Dashboard.tsx) are listed under "Modified files" because they require targeted changes as described in sections 5–7; they have not been altered yet.

### New files
- `frontend/src/components/channels/ChannelWizard.tsx`
- `frontend/src/components/channels/ChannelHome.tsx`
- `frontend/src/components/channels/ReviewQueue.tsx`
- `frontend/src/components/channels/TrendingFeed.tsx`
- `frontend/src/components/channels/AutoPostDisclaimer.tsx`
- `frontend/src/components/channels/VideoPreviewModal.tsx`
- `backend/app/utils/trending_service.py`
- `backend/app/worker/notification_tasks.py`

### Modified files
- `frontend/src/components/channels/ChannelDashboard.tsx` — swap modal for wizard, card click → ChannelHome panel
- `frontend/src/components/Dashboard.tsx` — add `selectedChannel` state, render ChannelHome
- `backend/app/routes/channel_routes.py` — new endpoints (trending-suggestions, videos list, approve, reject, disclaimer, trending, from-trend)
- `backend/app/routes/content_routes.py` — enhance `/voice-previews` to return name + description
- `backend/app/worker/scheduler.py` — write to `queued_videos` after dispatch; launch Celery countdown for 80% reminder
- `backend/app/utils/db_init.py` — add `notifications` collection + indexes
- `backend/app/requirements.txt` — add `feedparser`
