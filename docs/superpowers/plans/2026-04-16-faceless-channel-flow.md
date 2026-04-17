# Faceless Channel Flow Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete faceless channel lifecycle — 3-step creation wizard, per-channel home panel with review queue + trending feed, and disclaimer-gated auto-post permission.

**Architecture:** Backend-first (new endpoints + utilities → existing routes updated) then frontend (wizard → channel home components → Dashboard wiring). Each chunk is independently shippable and testable. No React Router added — ChannelHome renders as a panel inside Dashboard, mirroring the existing PipelineBuilder overlay pattern.

**Tech Stack:** FastAPI + PyMongo (backend), React 18 + TypeScript + Framer Motion (frontend), feedparser (Google News RSS), ElevenLabs (voices), Redis (trending cache), Celery (countdown notifications), APScheduler (channel crons).

**Spec:** `docs/superpowers/specs/2026-04-16-faceless-channel-flow-design.md`

**Local dev:** `docker-compose up -d` in `/tmp/sf-prod`, then `cd frontend && npm run dev -- --port 5180`. Backend at `http://localhost:8000`, auth bypass header: `Authorization: Bearer dev-bypass`.

---

## Chunk 1: Backend Foundation

Files touched:
- Modify: `backend/app/requirements.txt` — add feedparser
- Modify: `backend/app/utils/db_init.py` — add notifications collection + indexes
- Create: `backend/app/utils/trending_service.py` — Google News RSS fetcher with Redis cache
- Modify: `backend/app/routes/content_routes.py:105-137` — enrich voice-previews response with name + description

---

### Task 1: Add feedparser dependency

**Files:**
- Modify: `backend/app/requirements.txt`

- [ ] **Step 1: Add feedparser to requirements**

  Open `backend/app/requirements.txt`. Add on its own line (alphabetical order, after `fastapi`):
  ```
  feedparser
  ```

- [ ] **Step 2: Verify it installs in the container**

  ```bash
  cd /tmp/sf-prod
  docker-compose exec backend pip install feedparser --dry-run 2>&1 | head -5
  ```
  Expected: resolves without errors (or already installed).

- [ ] **Step 3: Commit**

  ```bash
  cd /tmp/sf-prod
  git add backend/app/requirements.txt
  git commit -m "chore(deps): add feedparser for Google News RSS trending topics"
  ```

---

### Task 2: Add notifications collection to db_init.py

**Files:**
- Modify: `backend/app/utils/db_init.py`

- [ ] **Step 1: Read the existing NEW_COLLECTIONS dict in db_init.py**

  Open `backend/app/utils/db_init.py`. The `NEW_COLLECTIONS` dict ends with `platform_posts`. Add `notifications` entry after it:

  ```python
  "notifications": [
      {"key": [("user_id", ASCENDING), ("created_at", DESCENDING)], "name": "notif_user_created"},
      {"key": [("user_id", ASCENDING), ("read", ASCENDING)], "name": "notif_user_read"},
      {"key": [("channel_id", ASCENDING)], "name": "notif_channel_id"},
  ],
  ```

- [ ] **Step 2: Verify collection is created on startup**

  ```bash
  cd /tmp/sf-prod
  docker-compose restart backend
  sleep 5
  docker-compose exec mongodb mongosh socialflow --eval "db.getCollectionNames()" --quiet
  ```
  Expected output includes `notifications`.

- [ ] **Step 3: Commit**

  ```bash
  git add backend/app/utils/db_init.py
  git commit -m "feat(db): add notifications collection with user+read indexes"
  ```

---

### Task 3: Create trending_service.py

**Files:**
- Create: `backend/app/utils/trending_service.py`

- [ ] **Step 1: Write a failing test**

  Create `backend/app/tests/test_trending_service.py`:

  ```python
  """Tests for trending_service — run with pytest."""
  import pytest
  from unittest.mock import patch, MagicMock


  def test_get_trending_returns_list_of_dicts():
      """Basic contract: returns a list of dicts with expected keys."""
      from utils.trending_service import get_trending_for_niche

      mock_feed = MagicMock()
      mock_feed.entries = [
          MagicMock(
              title="Fed holds rates",
              link="https://example.com/1",
              published="Wed, 16 Apr 2026 10:00:00 GMT",
              **{"source": MagicMock(title="Reuters")},
          )
      ]

      with patch("utils.trending_service.feedparser.parse", return_value=mock_feed), \
           patch("utils.trending_service._get_redis_client", return_value=None):
          result = get_trending_for_niche("personal finance", max_results=5)

      assert isinstance(result, list)
      assert len(result) == 1
      assert "title" in result[0]
      assert "url" in result[0]


  def test_get_trending_returns_empty_on_error():
      """On any fetch error, returns [] (non-fatal)."""
      from utils.trending_service import get_trending_for_niche

      with patch("utils.trending_service.feedparser.parse", side_effect=Exception("network error")), \
           patch("utils.trending_service._get_redis_client", return_value=None):
          result = get_trending_for_niche("tech")

      assert result == []


  def test_empty_niche_uses_general_query():
      """Empty niche → uses fallback query for general news."""
      from utils.trending_service import _build_feed_url

      url = _build_feed_url("")
      assert "trending+news+today" in url

  def test_niche_query_is_url_encoded():
      """Niche string is URL-encoded in feed URL."""
      from utils.trending_service import _build_feed_url

      url = _build_feed_url("personal finance")
      assert "personal+finance" in url or "personal%20finance" in url
  ```

- [ ] **Step 2: Run test to see it fail**

  ```bash
  cd /tmp/sf-prod
  docker-compose exec -e PYTHONPATH=/app/app backend pytest app/tests/test_trending_service.py -v 2>&1 | tail -15
  ```
  Expected: `ModuleNotFoundError: No module named 'utils.trending_service'`

- [ ] **Step 3: Implement trending_service.py**

  Create `backend/app/utils/trending_service.py`:

  ```python
  """
  Trending topics via Google News RSS.

  get_trending_for_niche(niche, max_results=8) → list[dict]

  Caches results in Redis for CACHE_TTL seconds (default 6h).
  Falls back to [] on any error (non-fatal — caller shows "No trends available").
  """
  import logging
  from urllib.parse import quote_plus

  import feedparser

  logger = logging.getLogger(__name__)

  CACHE_TTL = 6 * 3600  # 6 hours in seconds
  _FEED_BASE = "https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q={query}"


  def _build_feed_url(niche: str) -> str:
      query = niche.strip() if niche.strip() else "trending news today"
      return _FEED_BASE.format(query=quote_plus(query))


  def _get_redis_client():
      """Return Redis client or None if unavailable."""
      try:
          from utils.redis_client import _get_client
          return _get_client()
      except Exception:
          return None


  def get_trending_for_niche(niche: str, max_results: int = 8) -> list[dict]:
      """
      Fetch trending news topics for a given niche.
      Results are cached in Redis for CACHE_TTL seconds.
      Returns list of {title, url, source, published_at}.
      Returns [] on any error.
      """
      cache_key = f"trending:{niche[:80]}"

      # Try Redis cache first
      redis = _get_redis_client()
      if redis:
          try:
              import json
              cached = redis.get(cache_key)
              if cached:
                  return json.loads(cached)
          except Exception:
              pass  # Cache miss is fine — fall through to fetch

      try:
          feed_url = _build_feed_url(niche)
          feed = feedparser.parse(feed_url)
          results = []
          for entry in feed.entries[:max_results]:
              source = ""
              if hasattr(entry, "source") and hasattr(entry.source, "title"):
                  source = entry.source.title
              results.append({
                  "title": entry.get("title", ""),
                  "url": entry.get("link", ""),
                  "source": source,
                  "published_at": entry.get("published", ""),
              })

          # Store in Redis cache
          if redis and results:
              try:
                  import json
                  redis.setex(cache_key, CACHE_TTL, json.dumps(results))
              except Exception:
                  pass

          logger.info("Trending: fetched %d topics for niche='%s'", len(results), niche[:40])
          return results

      except Exception as exc:
          logger.warning("Trending: failed to fetch for niche='%s': %s", niche[:40], exc)
          return []
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  docker-compose exec -e PYTHONPATH=/app/app backend pytest app/tests/test_trending_service.py -v
  ```
  Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/app/utils/trending_service.py backend/app/tests/test_trending_service.py
  git commit -m "feat(trending): add trending_service — Google News RSS with Redis cache"
  ```

---

### Task 4: Enrich /content/voice-previews response

**Files:**
- Modify: `backend/app/routes/content_routes.py:105-137`

- [ ] **Step 1: Update the cache type and response shape**

  In `content_routes.py`, find the block starting at line 105 and replace through line 137:

  ```python
  # ---------------------------------------------------------------------------
  # Voice preview cache (fetched once from ElevenLabs; includes name + labels)
  # ---------------------------------------------------------------------------
  _voice_list_cache: list[dict] = []


  @router.get("/voice-previews")
  async def get_voice_previews(user_info: CurrentUser):
      """Return ElevenLabs voices with name, description, and preview URL."""
      global _voice_list_cache
      if _voice_list_cache:
          return {"voices": _voice_list_cache}

      api_key = os.getenv("ELEVENLABS_API_KEY", "")
      if not api_key:
          raise HTTPException(status_code=500, detail="ElevenLabs API key not configured")

      try:
          async with httpx.AsyncClient(timeout=15) as client:
              resp = await client.get(
                  "https://api.elevenlabs.io/v1/voices",
                  headers={"xi-api-key": api_key},
              )
              resp.raise_for_status()
              data = resp.json()

          voices = []
          for voice in data.get("voices", []):
              vid = voice.get("voice_id", "")
              preview = voice.get("preview_url", "")
              if not vid or not preview:
                  continue
              labels = voice.get("labels", {})
              description_parts = [v for v in [labels.get("accent"), labels.get("description"), labels.get("use_case")] if v]
              description = " · ".join(p.title() for p in description_parts) if description_parts else "General"
              voices.append({
                  "voice_id": vid,
                  "name": voice.get("name", vid),
                  "description": description,
                  "preview_url": preview,
              })

          _voice_list_cache = voices
          logger.info("Cached %d ElevenLabs voices with metadata", len(voices))
          return {"voices": voices}
      except Exception as e:
          logger.error("Failed to fetch voice previews: %s", e)
          raise HTTPException(status_code=502, detail="Could not fetch voice previews") from e
  ```

  > **Note:** Also rename `_voice_preview_cache` → `_voice_list_cache`. Search the file for any other reference to `_voice_preview_cache` and update to `_voice_list_cache`.

- [ ] **Step 2: Test endpoint manually**

  ```bash
  curl -s -H "Authorization: Bearer dev-bypass" http://localhost:8000/content/voice-previews | python3 -c "
  import sys, json
  d = json.load(sys.stdin)
  voices = d.get('voices', d.get('previews', []))
  print(f'Got {len(voices)} voices')
  if voices and isinstance(voices, list):
      print('First:', voices[0])
  "
  ```
  Expected: list of voice objects with `voice_id`, `name`, `description`, `preview_url` keys.
  
  > If `ELEVENLABS_API_KEY` is not set locally, the endpoint returns 500 — that is expected in local dev. The response shape change is still correct.

- [ ] **Step 3: Commit**

  ```bash
  git add backend/app/routes/content_routes.py
  git commit -m "feat(voices): enrich /voice-previews to return name + description per voice"
  ```

---

## Chunk 2: Backend Channel API — New Endpoints

Files touched:
- Modify: `backend/app/routes/channel_routes.py` — 7 new endpoints

---

### Task 5: Add channel video list + approve/reject + disclaimer endpoints

**Files:**
- Modify: `backend/app/routes/channel_routes.py`

- [ ] **Step 1: Write failing tests**

  Create `backend/app/tests/test_channel_video_routes.py`:

  ```python
  """
  Tests for new channel video endpoints.
  Uses FastAPI TestClient with dev-bypass auth.
  Run: pytest app/tests/test_channel_video_routes.py -v
  """
  import pytest
  from unittest.mock import patch, MagicMock
  from fastapi.testclient import TestClient


  def _make_app():
      """Build minimal app with only channel router for isolation."""
      import os
      os.environ.setdefault("DEV_BYPASS_AUTH", "true")
      from fastapi import FastAPI
      from routes.channel_routes import router
      app = FastAPI()
      app.include_router(router)
      return app


  @pytest.fixture
  def client():
      return TestClient(_make_app())


  def _auth():
      return {"Authorization": "Bearer dev-bypass"}


  def test_list_videos_returns_empty_when_no_videos(client):
      """GET /channels/{id}/videos returns [] when queued_videos is empty."""
      with patch("routes.channel_routes._col") as mock_col, \
           patch("routes.channel_routes._qv_col") as mock_qv:
          mock_col.return_value.find_one.return_value = {"_id": "abc", "user_id": "dev-bypass"}
          mock_qv.return_value.find.return_value = []
          resp = client.get("/channels/507f1f77bcf86cd799439011/videos", headers=_auth())
      assert resp.status_code == 200
      assert resp.json() == []


  def test_approve_video_sets_status(client):
      """POST /channels/{cid}/videos/{vid}/approve sets status=approved."""
      from bson import ObjectId
      cid = str(ObjectId())
      vid = str(ObjectId())
      with patch("routes.channel_routes._col") as mock_col, \
           patch("routes.channel_routes._qv_col") as mock_qv:
          mock_col.return_value.find_one.return_value = {"_id": cid, "user_id": "dev-bypass"}
          mock_qv.return_value.find_one.return_value = {"_id": vid, "channel_id": cid, "user_id": "dev-bypass"}
          mock_qv.return_value.update_one.return_value = MagicMock(matched_count=1)
          resp = client.post(f"/channels/{cid}/videos/{vid}/approve", headers=_auth())
      assert resp.status_code == 200
      assert resp.json()["success"] is True


  def test_reject_video_sets_status(client):
      """POST /channels/{cid}/videos/{vid}/reject sets status=rejected."""
      from bson import ObjectId
      cid = str(ObjectId())
      vid = str(ObjectId())
      with patch("routes.channel_routes._col") as mock_col, \
           patch("routes.channel_routes._qv_col") as mock_qv:
          mock_col.return_value.find_one.return_value = {"_id": cid, "user_id": "dev-bypass"}
          mock_qv.return_value.find_one.return_value = {"_id": vid, "channel_id": cid, "user_id": "dev-bypass"}
          mock_qv.return_value.update_one.return_value = MagicMock(matched_count=1)
          resp = client.post(f"/channels/{cid}/videos/{vid}/reject", headers=_auth())
      assert resp.status_code == 200


  def test_accept_disclaimer_updates_channel(client):
      """POST /channels/{id}/accept-disclaimer sets disclaimer fields + auto_post=true."""
      from bson import ObjectId
      cid = str(ObjectId())
      with patch("routes.channel_routes._col") as mock_col:
          mock_col.return_value.find_one.return_value = {"_id": cid, "user_id": "dev-bypass"}
          mock_col.return_value.update_one.return_value = MagicMock(matched_count=1)
          resp = client.post(f"/channels/{cid}/accept-disclaimer", headers=_auth())
      assert resp.status_code == 200
      assert resp.json()["success"] is True
  ```

- [ ] **Step 2: Run tests to see them fail**

  ```bash
  docker-compose exec -e PYTHONPATH=/app/app backend pytest app/tests/test_channel_video_routes.py -v 2>&1 | tail -20
  ```
  Expected: 404 or attribute errors — endpoints don't exist yet.

- [ ] **Step 2b: Add `setup_complete` to `ChannelUpdate` Pydantic model**

  In `backend/app/routes/channel_routes.py`, find the `ChannelUpdate` class (around line 53) and add one field:

  ```python
  class ChannelUpdate(BaseModel):
      name: Optional[str] = None
      niche: Optional[str] = None
      posting_frequency: Optional[str] = None
      auto_post: Optional[bool] = None
      review_window_minutes: Optional[int] = None
      setup_complete: Optional[bool] = None   # ← ADD THIS LINE
  ```

  Without this, the wizard's final `PUT /channels/{id}` call with `{setup_complete: true}` silently 422s (Pydantic v2 drops unknown fields, leaving zero known fields → "No fields to update" error).

- [ ] **Step 3: Add helper + new endpoints to channel_routes.py**

  In `backend/app/routes/channel_routes.py`, after the existing `_col()` helper (line ~66), add:

  ```python
  def _qv_col():
      """queued_videos collection."""
      return mongodb_service.get_database()["queued_videos"]


  def _notif_col():
      """notifications collection."""
      return mongodb_service.get_database()["notifications"]
  ```

  Then append these endpoints after the existing `delete_channel` route:

  ```python
  # ---------------------------------------------------------------------------
  # Channel video review queue
  # ---------------------------------------------------------------------------

  @router.get("/{channel_id}/videos")
  def list_channel_videos(
      channel_id: str,
      user_id: CurrentUser,
      status: Optional[str] = None,
  ):
      """
      List queued_videos for a channel.
      Optional ?status=pending_review,expired (comma-separated).
      Only returns videos belonging to the authenticated user's channel.
      """
      try:
          oid = ObjectId(channel_id)
      except Exception:
          raise HTTPException(status_code=422, detail="Invalid channel_id")

      # Verify channel ownership
      ch = _col().find_one({"_id": oid, "user_id": user_id})
      if not ch:
          raise HTTPException(status_code=404, detail="Channel not found")

      query: dict = {"channel_id": channel_id, "user_id": user_id}
      if status:
          statuses = [s.strip() for s in status.split(",") if s.strip()]
          query["status"] = {"$in": statuses}

      docs = list(_qv_col().find(query).sort("created_at", -1).limit(50))
      for d in docs:
          d["id"] = str(d.pop("_id"))
          if "review_deadline" in d and hasattr(d["review_deadline"], "isoformat"):
              d["review_deadline"] = d["review_deadline"].isoformat()
          if "created_at" in d and hasattr(d["created_at"], "isoformat"):
              d["created_at"] = d["created_at"].isoformat()
      return docs


  @router.post("/{channel_id}/videos/{video_id}/approve")
  def approve_video(channel_id: str, video_id: str, user_id: CurrentUser):
      """
      Approve a queued video — sets status=approved.
      Does NOT post to platform (platform OAuth is a future phase).
      Verifies: channel.user_id == user_id AND video.channel_id == channel_id.
      """
      try:
          c_oid = ObjectId(channel_id)
          v_oid = ObjectId(video_id)
      except Exception:
          raise HTTPException(status_code=422, detail="Invalid id")

      ch = _col().find_one({"_id": c_oid, "user_id": user_id})
      if not ch:
          raise HTTPException(status_code=404, detail="Channel not found")

      video = _qv_col().find_one({"_id": v_oid, "channel_id": channel_id, "user_id": user_id})
      if not video:
          raise HTTPException(status_code=404, detail="Video not found")

      now = datetime.now(timezone.utc)
      result = _qv_col().update_one(
          {"_id": v_oid},
          {"$set": {"status": "approved", "approved_at": now}},
      )
      if result.matched_count == 0:
          raise HTTPException(status_code=404, detail="Video not found")
      return {"success": True}


  @router.post("/{channel_id}/videos/{video_id}/reject")
  def reject_video(channel_id: str, video_id: str, user_id: CurrentUser):
      """
      Reject/discard a queued video — sets status=rejected.
      Same ownership checks as approve.
      """
      try:
          c_oid = ObjectId(channel_id)
          v_oid = ObjectId(video_id)
      except Exception:
          raise HTTPException(status_code=422, detail="Invalid id")

      ch = _col().find_one({"_id": c_oid, "user_id": user_id})
      if not ch:
          raise HTTPException(status_code=404, detail="Channel not found")

      video = _qv_col().find_one({"_id": v_oid, "channel_id": channel_id, "user_id": user_id})
      if not video:
          raise HTTPException(status_code=404, detail="Video not found")

      _qv_col().update_one(
          {"_id": v_oid},
          {"$set": {"status": "rejected", "rejected_at": datetime.now(timezone.utc)}},
      )
      return {"success": True}


  @router.post("/{channel_id}/accept-disclaimer")
  def accept_auto_post_disclaimer(channel_id: str, user_id: CurrentUser):
      """
      Record creator's explicit acceptance of auto-post disclaimer.
      Sets auto_post_disclaimer_accepted=True and auto_post=True on channel.
      """
      try:
          oid = ObjectId(channel_id)
      except Exception:
          raise HTTPException(status_code=422, detail="Invalid channel_id")

      ch = _col().find_one({"_id": oid, "user_id": user_id})
      if not ch:
          raise HTTPException(status_code=404, detail="Channel not found")

      now = datetime.now(timezone.utc)
      _col().update_one(
          {"_id": oid},
          {"$set": {
              "auto_post": True,
              "auto_post_disclaimer_accepted": True,
              "auto_post_disclaimer_accepted_at": now,
              "updated_at": now,
          }},
      )
      # Sync scheduler
      sync_channel(channel_id, auto_post=True, posting_frequency=ch.get("posting_frequency", "weekly"))
      return {"success": True}
  ```

- [ ] **Step 4: Run tests**

  ```bash
  docker-compose exec -e PYTHONPATH=/app/app backend pytest app/tests/test_channel_video_routes.py -v
  ```
  Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/app/routes/channel_routes.py backend/app/tests/test_channel_video_routes.py
  git commit -m "feat(api): add video list, approve, reject, accept-disclaimer endpoints"
  ```

---

### Task 6: Add trending endpoints

**Files:**
- Modify: `backend/app/routes/channel_routes.py`

- [ ] **Step 1: Add trending import at top of channel_routes.py**

  Near the top of `channel_routes.py`, after existing imports, add:
  ```python
  from utils.trending_service import get_trending_for_niche
  ```

- [ ] **Step 2: Add trending endpoints — REGISTER BEFORE any `/{channel_id}` routes**

  > **Route ordering is critical.** FastAPI matches routes in registration order. The static path `/trending-suggestions` must be registered BEFORE any route with a `/{channel_id}` path parameter. Add both trending endpoints at the **top** of the appended block, before Task 5's `list_channel_videos` and the other `/{channel_id}` endpoints. The safest approach is to insert them immediately after the `_notif_col()` helper, before the `list_channel_videos` definition.

  ```python
  # ---------------------------------------------------------------------------
  # Trending topics (MUST be registered before /{channel_id} routes)
  # ---------------------------------------------------------------------------

  @router.get("/trending-suggestions")
  def trending_suggestions():
      """
      General trending topics — no channel_id or auth required.
      Used in wizard Step 1 before a channel exists.
      Returns up to 8 topics from Google News (general query).
      """
      return {"topics": get_trending_for_niche("", max_results=8)}


  @router.get("/{channel_id}/trending")
  def channel_trending(channel_id: str, user_id: CurrentUser):
      """
      Trending topics filtered to the channel's niche.
      Cached in Redis for 6h per niche.
      """
      try:
          oid = ObjectId(channel_id)
      except Exception:
          raise HTTPException(status_code=422, detail="Invalid channel_id")

      ch = _col().find_one({"_id": oid, "user_id": user_id})
      if not ch:
          raise HTTPException(status_code=404, detail="Channel not found")

      niche = ch.get("niche") or ""
      return {"topics": get_trending_for_niche(niche, max_results=8)}
  ```

- [ ] **Step 3: Test trending-suggestions manually**

  ```bash
  curl -s http://localhost:8000/channels/trending-suggestions | python3 -m json.tool | head -20
  ```
  Expected: `{"topics": [...]}` — may be empty if Google News is unreachable from Docker.

- [ ] **Step 4: Add from-trend video generation endpoint**

  ```python
  class TrendVideoRequest(BaseModel):
      topic: str


  @router.post("/{channel_id}/videos/from-trend", status_code=202)
  def create_video_from_trend(channel_id: str, body: TrendVideoRequest, user_id: CurrentUser):
      """
      Trigger immediate video generation for a trending topic.
      Writes to queued_videos as pending_review BEFORE dispatching Celery task
      (render_video_task does not write to queued_videos itself).
      Returns job_id for status polling.
      """
      import uuid  # noqa: PLC0415
      from datetime import timedelta  # noqa: PLC0415
      try:
          oid = ObjectId(channel_id)
      except Exception:
          raise HTTPException(status_code=422, detail="Invalid channel_id")

      ch = _col().find_one({"_id": oid, "user_id": user_id})
      if not ch:
          raise HTTPException(status_code=404, detail="Channel not found")

      if not body.topic.strip():
          raise HTTPException(status_code=422, detail="topic is required")

      job_id = str(uuid.uuid4())
      now = datetime.now(timezone.utc)
      review_window = int(ch.get("review_window_minutes", 60))

      # Write queued_video record FIRST (render_video_task does not write this)
      _qv_col().insert_one({
          "channel_id": channel_id,
          "user_id": user_id,
          "job_id": job_id,
          "status": "pending_review",
          "review_deadline": now + timedelta(minutes=review_window),
          "source": "trending_trigger",
          "trending_topic": body.topic,
          "created_at": now,
      })

      try:
          from worker.video_tasks import render_video_task  # noqa: PLC0415
          render_video_task.delay(
              user_id=user_id,
              job_id=job_id,
              body={
                  "channel_id": channel_id,
                  "dialogue": f"Create a short video about this trending topic: {body.topic}",
                  "niche": ch.get("niche", ""),
                  "trending_topic": body.topic,
                  "source": "trending_trigger",
              },
          )
      except Exception as exc:
          logger.error("from-trend: failed to dispatch for channel %s: %s", channel_id, exc)
          # Don't raise — the queued_video record is written; Celery failure is non-fatal here
          # The video will remain in pending_review with no output_url until retried

      return {"job_id": job_id, "status": "queued"}
  ```

- [ ] **Step 5: Verify backend starts without errors**

  ```bash
  docker-compose restart backend
  sleep 5
  curl -s http://localhost:8000/health | python3 -m json.tool
  ```
  Expected: `{"status": "healthy", ...}`

- [ ] **Step 6: Commit**

  ```bash
  git add backend/app/routes/channel_routes.py
  git commit -m "feat(api): add trending-suggestions, channel trending, from-trend endpoints"
  ```

---

## Chunk 3: Backend Scheduler + Notifications

Files touched:
- Modify: `backend/app/worker/scheduler.py` — write to queued_videos, dispatch countdown
- Create: `backend/app/worker/notification_tasks.py` — Celery task for 80% reminder

---

### Task 7: Write queued_video record from scheduler

**Files:**
- Modify: `backend/app/worker/scheduler.py:121-190`

- [ ] **Step 1: Update `_run_channel_pipeline` to write to queued_videos after dispatch**

  In `scheduler.py`, find the `_run_channel_pipeline` function. After the `render_video_task.delay(...)` call and its `logger.info` line, add:

  ```python
  # ── Step 3: Write pending review record to queued_videos ────────────────
  try:
      from datetime import timedelta  # noqa: PLC0415
      review_window = int(ch.get("review_window_minutes", 60))
      deadline = datetime.now(timezone.utc) + timedelta(minutes=review_window)
      col = mongodb_service.get_database()["queued_videos"]
      col.insert_one({
          "channel_id": channel_id,
          "user_id": user_id,
          "job_id": job_id,
          "status": "pending_review",
          "review_deadline": deadline,
          "source": "scheduled",
          "trending_topic": None,
          "created_at": datetime.now(timezone.utc),
      })
      logger.info(
          f"APScheduler: queued_video written channel={channel_id} job_id={job_id} "
          f"review_deadline={deadline.isoformat()}"
      )

      # ── Step 4: Schedule 80% reminder via Celery countdown ───────────────
      try:
          from worker.notification_tasks import send_review_reminder  # noqa: PLC0415
          countdown_secs = int(review_window * 0.8 * 60)
          send_review_reminder.apply_async(
              args=[user_id, channel_id, job_id],
              countdown=countdown_secs,
          )
          logger.info(
              f"APScheduler: reminder scheduled in {countdown_secs}s for job_id={job_id}"
          )
      except Exception as notif_exc:
          logger.warning(f"APScheduler: failed to schedule reminder (non-fatal): {notif_exc}")

  except Exception as qv_exc:
      logger.error(f"APScheduler: failed to write queued_video for job_id={job_id}: {qv_exc}")
  ```

  Also add `from datetime import datetime, timezone` to the top of `scheduler.py` if not already present.

- [ ] **Step 2: Rebuild container and verify startup**

  ```bash
  cd /tmp/sf-prod
  docker-compose build backend && docker-compose up -d backend
  sleep 8
  curl -s http://localhost:8000/health | python3 -m json.tool
  ```
  Expected: healthy.

- [ ] **Step 3: Commit**

  ```bash
  git add backend/app/worker/scheduler.py
  git commit -m "feat(scheduler): write queued_video record + schedule 80% review reminder"
  ```

---

### Task 8: Create notification_tasks.py

**Files:**
- Create: `backend/app/worker/notification_tasks.py`

- [ ] **Step 1: Write the file**

  Create `backend/app/worker/notification_tasks.py`:

  ```python
  """
  Celery tasks for creator review notifications.

  send_review_reminder — fires at 80% of a video's review window.
  Writes to notifications collection + sends email if user email is resolvable.
  """
  import logging
  from datetime import datetime, timezone

  from worker.celery_app import celery_app

  logger = logging.getLogger(__name__)


  @celery_app.task(name="worker.notification_tasks.send_review_reminder", bind=True, max_retries=2)
  def send_review_reminder(self, user_id: str, channel_id: str, job_id: str):
      """
      Fired by APScheduler countdown at 80% of the review window.
      Skips if the video is already approved/rejected (creator acted early).
      Writes in-app notification and sends email.
      """
      try:
          from utils.mongodb_service import mongodb_service  # noqa: PLC0415

          db = mongodb_service.get_database()

          # Guard: MongoDB not connected
          if db is None:
              logger.warning(f"send_review_reminder: MongoDB not connected — skipping job_id={job_id}")
              return

          # Check if video is still pending (skip if already acted on)
          video = db["queued_videos"].find_one({"job_id": job_id})
          if not video:
              logger.info(f"send_review_reminder: job_id={job_id} not found — skipping")
              return
          if video.get("status") not in ("pending_review",):
              logger.info(
                  f"send_review_reminder: job_id={job_id} status={video['status']} — already handled"
              )
              return

          # Write in-app notification
          now = datetime.now(timezone.utc)
          db["notifications"].insert_one({
              "user_id": user_id,
              "channel_id": channel_id,
              "video_id": job_id,
              "type": "review_reminder",
              "message": "Your video approval is expiring soon — review it before it expires.",
              "read": False,
              "created_at": now,
          })

          # Send email (best-effort, non-fatal)
          _send_reminder_email(user_id, channel_id)

      except Exception as exc:
          logger.error(f"send_review_reminder: failed for job_id={job_id}: {exc}")
          raise self.retry(exc=exc, countdown=60)


  def _send_reminder_email(user_id: str, channel_id: str) -> None:
      """Resolve user email and send review reminder email. Non-fatal on any error."""
      try:
          from utils.user_service import user_service  # noqa: PLC0415
          user = user_service.get_user_by_supabase_id(user_id)
          if not user:
              return
          to_email = user.get("email")
          if not to_email:
              return

          from bson import ObjectId  # noqa: PLC0415
          from utils.mongodb_service import mongodb_service  # noqa: PLC0415
          # ObjectId required — channel_id is a string, MongoDB _id is ObjectId
          ch = mongodb_service.get_database()["channels"].find_one({"_id": ObjectId(channel_id)})
          channel_name = ch.get("name", "your channel") if ch else "your channel"

          # _send() is the correct internal mailer — send_notification() does not exist
          from utils.notifications import _send  # noqa: PLC0415
          _send(
              to_email=to_email,
              subject=f"[SocialFlow] Video approval expiring — {channel_name}",
              html=(
                  f"<p>Hi,</p>"
                  f"<p>A video generated for <strong>{channel_name}</strong> is expiring soon.</p>"
                  f"<p>Log in to SocialFlow to review and approve or discard it before the window closes.</p>"
                  f"<p>— The SocialFlow team</p>"
              ),
              plain=(
                  f"Hi,\n\nA video generated for '{channel_name}' is expiring soon.\n"
                  "Log in to SocialFlow to review and approve or discard it.\n\n"
                  "— The SocialFlow team"
              ),
          )
      except Exception as exc:
          logger.warning(f"_send_reminder_email: failed (non-fatal): {exc}")
  ```

- [ ] **Step 2: Verify Celery worker picks up the new task**

  ```bash
  docker-compose restart celery_worker
  sleep 10
  docker-compose logs celery_worker --tail=20
  ```
  Expected: worker starts, logs show registered tasks including `worker.notification_tasks.send_review_reminder`.

- [ ] **Step 3: Commit**

  ```bash
  git add backend/app/worker/notification_tasks.py
  git commit -m "feat(notifications): add send_review_reminder Celery task with email + in-app"
  ```

---

## Chunk 4: Frontend — Channel Creation Wizard

Files touched:
- Create: `frontend/src/components/channels/ChannelWizard.tsx`
- Modify: `frontend/src/components/channels/ChannelDashboard.tsx` — swap modal → wizard

---

### Task 9: Create ChannelWizard.tsx

**Files:**
- Create: `frontend/src/components/channels/ChannelWizard.tsx`

- [ ] **Step 1: Create the wizard component**

  Create `frontend/src/components/channels/ChannelWizard.tsx`:

  ```tsx
  import { useState, useEffect } from 'react';
  import { motion, AnimatePresence } from 'framer-motion';
  import { ChevronLeft, Loader2, Play } from 'lucide-react';
  import { getAuthHeaders } from '../../utils/getAuthToken';
  import { API_BASE_URL } from '../../config/api';

  const PLATFORMS = ['youtube', 'instagram', 'tiktok'] as const;
  type Platform = typeof PLATFORMS[number];
  const FREQUENCIES = ['daily', '3x_week', 'weekly'] as const;
  const FREQ_LABEL: Record<string, string> = { daily: 'Daily', '3x_week': '3× / week', weekly: 'Weekly' };
  const PLATFORM_EMOJI: Record<string, string> = { youtube: '📺', instagram: '📸', tiktok: '🎵' };

  interface TrendingTopic { title: string; url: string; source: string; published_at: string; }
  interface Voice { voice_id: string; name: string; description: string; preview_url: string; }

  interface ChannelWizardProps {
    onCreated: (channelId: string) => void;
    onCancel: () => void;
  }

  export default function ChannelWizard({ onCreated, onCancel }: ChannelWizardProps) {
    const [step, setStep] = useState(1);

    // Step 1
    const [name, setName] = useState('');
    const [niche, setNiche] = useState('');
    const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([]);

    // Step 2
    const [platform, setPlatform] = useState<Platform>('youtube');
    const [frequency, setFrequency] = useState('weekly');

    // Step 3
    const [voices, setVoices] = useState<Voice[]>([]);
    const [selectedVoiceId, setSelectedVoiceId] = useState('');
    const [playingVoiceId, setPlayingVoiceId] = useState('');

    // Submission
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    // Fetch trending topics on mount (Step 1 chips)
    useEffect(() => {
      fetch(`${API_BASE_URL}/channels/trending-suggestions`)
        .then(r => r.json())
        .then(d => setTrendingTopics(d.topics || []))
        .catch(() => {});
    }, []);

    // Fetch voices when user reaches Step 3
    useEffect(() => {
      if (step !== 3) return;
      getAuthHeaders().then(headers =>
        fetch(`${API_BASE_URL}/content/voice-previews`, { headers })
          .then(r => r.json())
          .then(d => {
            const list: Voice[] = d.voices || [];
            setVoices(list);
            if (list.length > 0 && !selectedVoiceId) setSelectedVoiceId(list[0].voice_id);
          })
          .catch(() => {})
      );
    }, [step]);

    const playPreview = (voice: Voice) => {
      setPlayingVoiceId(voice.voice_id);
      const audio = new Audio(voice.preview_url);
      audio.play().catch(() => {});
      audio.onended = () => setPlayingVoiceId('');
    };

    const handleSubmit = async () => {
      if (!name.trim()) { setError('Channel name is required'); return; }
      setSubmitting(true);
      setError('');
      try {
        const headers = await getAuthHeaders();
        const json = (method: string, url: string, body: object) =>
          fetch(url, { method, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

        // 1. Create channel
        const channelRes = await json('POST', `${API_BASE_URL}/channels/`, {
          name: name.trim(), platform, niche: niche.trim() || undefined, posting_frequency: frequency,
        });
        if (!channelRes.ok) throw new Error('Failed to create channel');
        const channel = await channelRes.json();

        // 2. Save voice to model_config
        if (selectedVoiceId) {
          await json('POST', `${API_BASE_URL}/model-config/`, {
            channel_id: channel.id, voice_provider: 'elevenlabs', voice_id: selectedVoiceId,
          }).catch(() => {}); // non-fatal
        }

        // 3. Mark setup complete
        await json('PUT', `${API_BASE_URL}/channels/${channel.id}`, { setup_complete: true })
          .catch(() => {}); // non-fatal

        onCreated(channel.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to create channel');
      } finally {
        setSubmitting(false);
      }
    };

    const inputClass = 'w-full rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-2.5 text-sm text-white focus:outline-none focus:border-teal-500/50 placeholder:text-white/30';

    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.2 }}
          className="bg-[#0d1117] border border-white/[0.08] rounded-2xl p-6 w-full max-w-lg"
        >
          {/* Progress bar */}
          <div className="flex gap-2 mb-6">
            {[1, 2, 3].map(s => (
              <div key={s} className={`flex-1 h-1 rounded-full transition-all duration-300 ${s <= step ? 'bg-teal-500' : 'bg-white/10'}`} />
            ))}
          </div>

          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <p className="text-xs text-white/40 uppercase tracking-widest mb-1">Step 1 of 3</p>
                <h3 className="text-lg font-semibold text-white mb-1">Name your channel</h3>
                <p className="text-sm text-white/40 mb-5">What is this channel going to be about?</p>
                <div className="space-y-4">
                  <input className={inputClass} placeholder="e.g. Mindful Money" value={name} onChange={e => setName(e.target.value)} />
                  <input className={inputClass} placeholder="Niche / topic (e.g. Personal Finance for Millennials)" value={niche} onChange={e => setNiche(e.target.value)} />
                  {trendingTopics.length > 0 && (
                    <div>
                      <p className="text-xs text-amber-400/80 flex items-center gap-1.5 mb-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                        Trending right now — click to use as niche
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {trendingTopics.slice(0, 5).map((t, i) => (
                          <button key={i} onClick={() => setNiche(t.title)}
                            className="px-3 py-1 rounded-full text-xs border border-amber-400/20 bg-amber-400/05 text-amber-300/80 hover:border-amber-400/40 transition-all">
                            {t.title.length > 40 ? t.title.slice(0, 40) + '…' : t.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <p className="text-xs text-white/40 uppercase tracking-widest mb-1">Step 2 of 3</p>
                <h3 className="text-lg font-semibold text-white mb-1">Platform & frequency</h3>
                <p className="text-sm text-white/40 mb-5">Where will this channel post, and how often?</p>
                <div className="space-y-3 mb-5">
                  {PLATFORMS.map(p => (
                    <button key={p} onClick={() => setPlatform(p)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${platform === p ? 'border-teal-500/60 bg-teal-500/08' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14]'}`}>
                      <span className="text-xl">{PLATFORM_EMOJI[p]}</span>
                      <span className={`text-sm font-medium capitalize ${platform === p ? 'text-white' : 'text-white/50'}`}>{p}</span>
                      {platform === p && <span className="ml-auto w-4 h-4 rounded-full bg-teal-500 flex items-center justify-center text-[10px]">✓</span>}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-white/40 mb-2">Posting frequency</p>
                <div className="flex gap-2">
                  {FREQUENCIES.map(f => (
                    <button key={f} onClick={() => setFrequency(f)}
                      className={`flex-1 py-2 rounded-lg text-xs border transition-all ${frequency === f ? 'border-teal-500/60 bg-teal-500/08 text-white' : 'border-white/[0.07] text-white/40 hover:border-white/[0.14]'}`}>
                      {FREQ_LABEL[f]}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <p className="text-xs text-white/40 uppercase tracking-widest mb-1">Step 3 of 3</p>
                <h3 className="text-lg font-semibold text-white mb-1">Pick your voice</h3>
                <p className="text-sm text-white/40 mb-5">This voice narrates every video on this channel.</p>
                {voices.length === 0 ? (
                  <div className="flex items-center gap-2 text-white/40 text-sm py-4">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading voices…
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {voices.map(v => (
                      <button key={v.voice_id} onClick={() => setSelectedVoiceId(v.voice_id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${selectedVoiceId === v.voice_id ? 'border-teal-500/60 bg-teal-500/08' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14]'}`}>
                        <span className="text-lg shrink-0">🎙️</span>
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-medium ${selectedVoiceId === v.voice_id ? 'text-white' : 'text-white/60'}`}>{v.name}</div>
                          <div className="text-xs text-white/30 truncate">{v.description}</div>
                        </div>
                        <button onClick={e => { e.stopPropagation(); playPreview(v); }}
                          className="shrink-0 flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 transition-all">
                          <Play className={`h-3 w-3 ${playingVoiceId === v.voice_id ? 'text-teal-400' : ''}`} />
                          {playingVoiceId === v.voice_id ? 'Playing' : 'Play'}
                        </button>
                      </button>
                    ))}
                  </div>
                )}
                {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex gap-3 mt-6">
            <button onClick={step === 1 ? onCancel : () => setStep(s => s - 1)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/[0.07] text-sm text-white/50 hover:text-white/80 hover:border-white/[0.14] transition-all">
              {step === 1 ? 'Cancel' : <><ChevronLeft className="h-4 w-4" /> Back</>}
            </button>
            <button
              disabled={step === 3 && submitting}
              onClick={() => { if (step < 3) setStep(s => s + 1); else handleSubmit(); }}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-400 py-2.5 text-sm font-medium text-black hover:opacity-90 transition-opacity disabled:opacity-60">
              {step === 3 && submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</> : step === 3 ? 'Create Channel' : 'Continue →'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Verify it compiles**

  ```bash
  cd /tmp/sf-prod/frontend && npx tsc --noEmit 2>&1 | grep -i "ChannelWizard" | head -10
  ```
  Expected: no errors relating to ChannelWizard.tsx.

- [ ] **Step 3: Commit**

  ```bash
  cd /tmp/sf-prod
  git add frontend/src/components/channels/ChannelWizard.tsx
  git commit -m "feat(ui): add ChannelWizard 3-step creation flow"
  ```

---

### Task 10: Wire ChannelWizard into ChannelDashboard

**Files:**
- Modify: `frontend/src/components/channels/ChannelDashboard.tsx`

- [ ] **Step 1: Add wizard state + import**

  At the top of `ChannelDashboard.tsx`, add the import:
  ```tsx
  import ChannelWizard from './ChannelWizard';
  ```

  Inside the component, add state:
  ```tsx
  const [showWizard, setShowWizard] = useState(false);
  ```

- [ ] **Step 2: Replace the "New Channel" button's onClick and modal**

  Find the "New Channel" button:
  ```tsx
  onClick={() => setShowCreateModal(true)}
  ```
  Change to:
  ```tsx
  onClick={() => setShowWizard(true)}
  ```

  Find the `AnimatePresence` block containing the create modal. Wrap it to conditionally show the wizard instead:

  ```tsx
  <AnimatePresence>
    {showWizard && (
      <ChannelWizard
        onCreated={(channelId) => {
          setShowWizard(false);
          onOpenPipeline(channelId); // will be replaced by onOpenChannelHome in Task 12
        }}
        onCancel={() => setShowWizard(false)}
      />
    )}
  </AnimatePresence>

  {/* Keep old modal as fallback — remove in Task 12 once ChannelHome is wired */}
  <AnimatePresence>
    {showCreateModal && ( /* ... existing modal ... */ )}
  </AnimatePresence>
  ```

- [ ] **Step 3: Test wizard in browser**

  Visit `http://localhost:5180`, navigate to Channels tab, click "New Channel". Verify:
  - 3-step wizard opens
  - Step 1 shows trending chips (may be empty in local dev)
  - Step 2 shows platform + frequency picker
  - Step 3 shows voice loading spinner (spins if ELEVENLABS_API_KEY not set)
  - Cancel closes the wizard

- [ ] **Step 4: Commit**

  ```bash
  cd /tmp/sf-prod
  git add frontend/src/components/channels/ChannelDashboard.tsx
  git commit -m "feat(ui): wire ChannelWizard into ChannelDashboard — replaces create modal"
  ```

---

## Chunk 5: Frontend — Channel Home Panel

Files touched:
- Create: `frontend/src/components/channels/VideoPreviewModal.tsx`
- Create: `frontend/src/components/channels/AutoPostDisclaimer.tsx`
- Create: `frontend/src/components/channels/ReviewQueue.tsx`
- Create: `frontend/src/components/channels/TrendingFeed.tsx`
- Create: `frontend/src/components/channels/ChannelHome.tsx`
- Modify: `frontend/src/components/Dashboard.tsx` — add selectedChannel state + ChannelHome render

---

### Task 11: Create VideoPreviewModal + AutoPostDisclaimer

**Files:**
- Create: `frontend/src/components/channels/VideoPreviewModal.tsx`
- Create: `frontend/src/components/channels/AutoPostDisclaimer.tsx`

- [ ] **Step 1: Create VideoPreviewModal.tsx**

  ```tsx
  import { motion } from 'framer-motion';
  import { X } from 'lucide-react';

  interface VideoPreviewModalProps {
    outputUrl: string;
    title: string;
    onClose: () => void;
  }

  export default function VideoPreviewModal({ outputUrl, title, onClose }: VideoPreviewModalProps) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-[#0d1117] border border-white/[0.08] rounded-2xl overflow-hidden w-full max-w-xl"
        >
          <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
            <h3 className="text-sm font-medium text-white truncate pr-4">{title}</h3>
            <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="p-4">
            <video
              src={outputUrl}
              controls
              autoPlay
              className="w-full rounded-xl bg-black aspect-video"
            />
          </div>
        </motion.div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Create AutoPostDisclaimer.tsx**

  ```tsx
  import { useState } from 'react';
  import { motion } from 'framer-motion';
  import { AlertTriangle, Loader2 } from 'lucide-react';
  import { getAuthHeaders } from '../../utils/getAuthToken';
  import { API_BASE_URL } from '../../config/api';

  interface AutoPostDisclaimerProps {
    channelId: string;
    onAccepted: () => void;
    onCancel: () => void;
  }

  const DISCLAIMER_TEXT = `SocialFlow generates video content using artificial intelligence. We cannot guarantee the accuracy, appropriateness, completeness, or legality of AI-generated content. By enabling auto-post, you accept full and sole responsibility for all content published to your social media channel(s). SocialFlow, its affiliates, and its employees are not liable for any claims, damages, losses, or actions arising from content auto-posted on your behalf. You may disable auto-post at any time from your channel settings.`;

  export default function AutoPostDisclaimer({ channelId, onAccepted, onCancel }: AutoPostDisclaimerProps) {
    const [checked, setChecked] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleAccept = async () => {
      if (!checked) return;
      setSaving(true);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`${API_BASE_URL}/channels/${channelId}/accept-disclaimer`, {
          method: 'POST',
          headers,
        });
        if (!res.ok) throw new Error('Failed to accept disclaimer');
        onAccepted();
      } catch (e) {
        setError('Could not save — please try again.');
      } finally {
        setSaving(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-[#0d1117] border border-amber-500/30 rounded-2xl p-6 w-full max-w-md"
        >
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
            <h3 className="text-base font-semibold text-white">Auto-Post Requires Your Permission</h3>
          </div>
          <p className="text-sm text-white/50 leading-relaxed mb-4">
            By enabling auto-post, videos generated by AI will be published to your channel automatically without manual review.
          </p>
          <div className="bg-black/30 border border-amber-500/15 rounded-xl p-4 text-xs text-white/40 leading-relaxed mb-5">
            <strong className="text-amber-400">Disclaimer: </strong>{DISCLAIMER_TEXT}
          </div>
          <label className="flex items-start gap-3 cursor-pointer mb-5">
            <input
              type="checkbox"
              checked={checked}
              onChange={e => setChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/[0.02] text-teal-500 focus:ring-teal-500/50"
            />
            <span className="text-sm text-white/60">
              I understand that AI-generated content may be inaccurate and I accept full responsibility for all posts made to my channel.
            </span>
          </label>
          {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
          <div className="flex gap-3">
            <button onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl border border-white/[0.07] text-sm text-white/50 hover:text-white/80 hover:border-white/[0.14] transition-all">
              Cancel
            </button>
            <button
              disabled={!checked || saving}
              onClick={handleAccept}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-teal-400 text-sm font-medium text-black disabled:opacity-40 transition-opacity">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Enable Auto-Post
            </button>
          </div>
        </motion.div>
      </div>
    );
  }
  ```

- [ ] **Step 3: Verify TypeScript compilation**

  ```bash
  cd /tmp/sf-prod/frontend && npx tsc --noEmit 2>&1 | grep -E "VideoPreview|AutoPost" | head -10
  ```
  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  cd /tmp/sf-prod
  git add frontend/src/components/channels/VideoPreviewModal.tsx frontend/src/components/channels/AutoPostDisclaimer.tsx
  git commit -m "feat(ui): add VideoPreviewModal and AutoPostDisclaimer components"
  ```

---

### Task 12: Create ReviewQueue.tsx

**Files:**
- Create: `frontend/src/components/channels/ReviewQueue.tsx`

- [ ] **Step 1: Create ReviewQueue.tsx**

  ```tsx
  import { useState, useEffect, useCallback } from 'react';
  import { AnimatePresence, motion } from 'framer-motion';
  import { Eye, CheckCircle, XCircle, Loader2, Clock } from 'lucide-react';
  import { getAuthHeaders } from '../../utils/getAuthToken';
  import { API_BASE_URL } from '../../config/api';
  import VideoPreviewModal from './VideoPreviewModal';

  interface QueuedVideo {
    id: string;
    job_id: string;
    status: 'pending_review' | 'approved' | 'rejected' | 'expired' | 'posted';
    review_deadline?: string;
    created_at: string;
    source: 'scheduled' | 'trending_trigger';
    trending_topic?: string;
    output_url?: string;
    title?: string;
    dialogue?: string;
  }

  interface ReviewQueueProps {
    channelId: string;
  }

  function countdown(deadline: string): string {
    const diff = new Date(deadline).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m remaining` : `${m}m remaining`;
  }

  export default function ReviewQueue({ channelId }: ReviewQueueProps) {
    const [videos, setVideos] = useState<QueuedVideo[]>([]);
    const [loading, setLoading] = useState(true);
    const [previewVideo, setPreviewVideo] = useState<QueuedVideo | null>(null);
    const [actioning, setActioning] = useState<string | null>(null);

    const fetchVideos = useCallback(async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(
          `${API_BASE_URL}/channels/${channelId}/videos?status=pending_review,expired,approved,posted`,
          { headers }
        );
        if (!res.ok) return;
        const data: QueuedVideo[] = await res.json();
        setVideos(data);
      } catch { /* non-fatal */ }
      finally { setLoading(false); }
    }, [channelId]);

    useEffect(() => {
      fetchVideos();
      const interval = setInterval(fetchVideos, 30_000);
      return () => clearInterval(interval);
    }, [fetchVideos]);

    const action = async (videoId: string, act: 'approve' | 'reject') => {
      setActioning(videoId);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(
          `${API_BASE_URL}/channels/${channelId}/videos/${videoId}/${act}`,
          { method: 'POST', headers }
        );
        if (res.ok) await fetchVideos();
      } catch { /* non-fatal */ }
      finally { setActioning(null); }
    };

    const pending = videos.filter(v => v.status === 'pending_review');
    const expired = videos.filter(v => v.status === 'expired');
    const done = videos.filter(v => ['approved', 'posted'].includes(v.status));

    if (loading) return (
      <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-teal-400" /></div>
    );

    return (
      <div className="space-y-4">
        {/* Pending */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-white">Review Queue</h3>
          {pending.length > 0 && (
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-400">
              {pending.length} awaiting
            </span>
          )}
        </div>

        <AnimatePresence>
          {pending.map(v => (
            <motion.div key={v.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="rounded-xl border border-amber-500/20 bg-amber-500/04 p-4">
              <div className="flex gap-3 mb-3">
                <div className="w-20 h-12 rounded-lg bg-gradient-to-br from-teal-500/20 to-teal-900/40 shrink-0 flex items-center justify-center text-lg">▶</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{v.title || v.trending_topic || 'Generated video'}</p>
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-amber-400">
                    <Clock className="h-3 w-3" />
                    {v.review_deadline ? countdown(v.review_deadline) : ''}
                  </div>
                  {v.dialogue && <p className="text-xs text-white/30 truncate mt-1">{v.dialogue}</p>}
                </div>
              </div>
              <div className="flex gap-2">
                {v.output_url && (
                  <button onClick={() => setPreviewVideo(v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.07] text-xs text-white/50 hover:text-white/80 hover:border-white/[0.14] transition-all">
                    <Eye className="h-3.5 w-3.5" /> Preview
                  </button>
                )}
                <button onClick={() => action(v.id, 'reject')} disabled={actioning === v.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/25 bg-red-500/06 text-xs text-red-400 hover:border-red-500/40 transition-all disabled:opacity-40">
                  <XCircle className="h-3.5 w-3.5" /> Reject
                </button>
                <button onClick={() => action(v.id, 'approve')} disabled={actioning === v.id}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-teal-500 to-teal-400 text-xs font-semibold text-black disabled:opacity-40 transition-opacity">
                  {actioning === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                  Approve & Post
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Expired */}
        {expired.length > 0 && (
          <div>
            <p className="text-xs text-white/30 uppercase tracking-wide mb-2">Expired — not posted</p>
            {expired.map(v => (
              <div key={v.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 mb-2 opacity-60">
                <div className="flex gap-3 items-center mb-2">
                  <div className="w-16 h-10 rounded-lg bg-white/05 shrink-0 flex items-center justify-center text-sm">⏰</div>
                  <p className="text-xs text-white/50 truncate flex-1">{v.title || 'Expired video'}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => action(v.id, 'reject')}
                    className="text-xs px-3 py-1.5 rounded-lg border border-white/[0.07] text-white/40 hover:text-white/60 transition-all">
                    Discard
                  </button>
                  <button onClick={() => action(v.id, 'approve')}
                    className="flex-1 text-xs px-3 py-1.5 rounded-lg border border-teal-500/25 bg-teal-500/06 text-teal-400 hover:border-teal-500/40 transition-all">
                    Still post it →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* History */}
        {done.length > 0 && (
          <div>
            <p className="text-xs text-white/30 uppercase tracking-wide mb-2">Posted / Approved</p>
            {done.slice(0, 5).map(v => (
              <div key={v.id} className="flex gap-3 items-center p-3 rounded-xl border border-white/[0.04] opacity-50 mb-1">
                <div className="w-12 h-8 rounded-lg bg-white/05 shrink-0 flex items-center justify-center text-sm">✓</div>
                <p className="text-xs text-white/40 truncate">{v.title || 'Video'}</p>
                <span className="ml-auto text-xs text-teal-400/60 capitalize">{v.status}</span>
              </div>
            ))}
          </div>
        )}

        {pending.length === 0 && expired.length === 0 && done.length === 0 && (
          <p className="text-sm text-white/30 text-center py-10">No videos yet. Your channel will generate content on its next scheduled run.</p>
        )}

        <AnimatePresence>
          {previewVideo && previewVideo.output_url && (
            <VideoPreviewModal
              outputUrl={previewVideo.output_url}
              title={previewVideo.title || 'Video Preview'}
              onClose={() => setPreviewVideo(null)}
            />
          )}
        </AnimatePresence>
      </div>
    );
  }
  ```

- [ ] **Step 2: Verify TypeScript**

  ```bash
  cd /tmp/sf-prod/frontend && npx tsc --noEmit 2>&1 | grep "ReviewQueue" | head -5
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  cd /tmp/sf-prod
  git add frontend/src/components/channels/ReviewQueue.tsx
  git commit -m "feat(ui): add ReviewQueue component with approve/reject/preview"
  ```

---

### Task 13: Create TrendingFeed.tsx

**Files:**
- Create: `frontend/src/components/channels/TrendingFeed.tsx`

- [ ] **Step 1: Create TrendingFeed.tsx**

  ```tsx
  import { useState, useEffect } from 'react';
  import { Loader2, RefreshCw, Zap } from 'lucide-react';
  import { getAuthHeaders } from '../../utils/getAuthToken';
  import { API_BASE_URL } from '../../config/api';

  interface Topic { title: string; url: string; source: string; published_at: string; }

  interface TrendingFeedProps {
    channelId: string;
    onVideoQueued: () => void; // called after successful from-trend dispatch → refresh queue
  }

  const REFRESH_OPTIONS = [
    { label: '1h', seconds: 3600 },
    { label: '6h', seconds: 21600 },
    { label: '24h', seconds: 86400 },
  ];

  export default function TrendingFeed({ channelId, onVideoQueued }: TrendingFeedProps) {
    const [topics, setTopics] = useState<Topic[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshIntervalSecs, setRefreshIntervalSecs] = useState(21600); // 6h default
    const [generating, setGenerating] = useState<string | null>(null);
    const [generated, setGenerated] = useState<Set<string>>(new Set());

    const fetchTopics = async () => {
      setLoading(true);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`${API_BASE_URL}/channels/${channelId}/trending`, { headers });
        if (res.ok) {
          const d = await res.json();
          setTopics(d.topics || []);
        }
      } catch { /* non-fatal */ }
      finally { setLoading(false); }
    };

    useEffect(() => {
      fetchTopics();
      const interval = setInterval(fetchTopics, refreshIntervalSecs * 1000);
      return () => clearInterval(interval);
    }, [channelId, refreshIntervalSecs]);

    const makeVideo = async (topic: Topic) => {
      setGenerating(topic.title);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`${API_BASE_URL}/channels/${channelId}/videos/from-trend`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: topic.title }),
        });
        if (res.ok) {
          setGenerated(prev => new Set([...prev, topic.title]));
          onVideoQueued();
        }
      } catch { /* non-fatal */ }
      finally { setGenerating(null); }
    };

    return (
      <div className="w-56 shrink-0 border-l border-white/[0.05] pl-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs font-semibold text-white">Trending Now</span>
        </div>
        <p className="text-xs text-white/30 mb-3">Topics in your niche right now</p>

        {loading ? (
          <div className="flex items-center gap-1.5 text-xs text-white/30 py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        ) : topics.length === 0 ? (
          <p className="text-xs text-white/20 py-4">No trends available right now.</p>
        ) : (
          <div className="space-y-3">
            {topics.map((t, i) => (
              <div key={i} className={`rounded-xl border p-3 transition-all ${i === 0 ? 'border-amber-500/20 bg-amber-500/04' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                <p className={`text-xs font-medium leading-snug mb-1 ${i === 0 ? 'text-white' : 'text-white/60'}`}>
                  {t.title.length > 60 ? t.title.slice(0, 60) + '…' : t.title}
                </p>
                {t.source && <p className="text-[10px] text-white/20 mb-2">{t.source}</p>}
                <button
                  disabled={generating === t.title || generated.has(t.title)}
                  onClick={() => makeVideo(t)}
                  className="w-full py-1 rounded-lg text-[10px] border transition-all disabled:opacity-40
                    border-teal-500/30 bg-teal-500/06 text-teal-400 hover:border-teal-500/50 hover:bg-teal-500/10">
                  {generating === t.title ? (
                    <span className="flex items-center justify-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Queuing…</span>
                  ) : generated.has(t.title) ? (
                    <span className="flex items-center justify-center gap-1"><Zap className="h-3 w-3" /> Queued ✓</span>
                  ) : '+ Make video'}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Refresh picker */}
        <div className="mt-4 pt-3 border-t border-white/[0.05]">
          <p className="text-[10px] text-white/30 mb-1.5">Refresh every</p>
          <div className="flex gap-1">
            {REFRESH_OPTIONS.map(opt => (
              <button key={opt.label} onClick={() => setRefreshIntervalSecs(opt.seconds)}
                className={`flex-1 py-1 rounded-lg text-[10px] border transition-all ${refreshIntervalSecs === opt.seconds ? 'border-teal-500/40 bg-teal-500/08 text-teal-400' : 'border-white/[0.07] text-white/30 hover:border-white/[0.14]'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <button onClick={fetchTopics} className="mt-2 flex items-center gap-1 text-[10px] text-white/20 hover:text-white/40 transition-colors">
          <RefreshCw className="h-3 w-3" /> Refresh now
        </button>
      </div>
    );
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  cd /tmp/sf-prod
  git add frontend/src/components/channels/TrendingFeed.tsx
  git commit -m "feat(ui): add TrendingFeed sidebar with make-video trigger"
  ```

---

### Task 14: Create ChannelHome.tsx + wire into Dashboard

**Files:**
- Create: `frontend/src/components/channels/ChannelHome.tsx`
- Modify: `frontend/src/components/Dashboard.tsx`

- [ ] **Step 1: Create ChannelHome.tsx**

  ```tsx
  import { useState, useEffect } from 'react';
  import { motion, AnimatePresence } from 'framer-motion';
  import { ChevronLeft, Settings, ToggleLeft, ToggleRight } from 'lucide-react';
  import { getAuthHeaders } from '../../utils/getAuthToken';
  import { API_BASE_URL } from '../../config/api';
  import ReviewQueue from './ReviewQueue';
  import TrendingFeed from './TrendingFeed';
  import AutoPostDisclaimer from './AutoPostDisclaimer';

  interface Channel {
    id: string; name: string; platform: string; niche?: string;
    auto_post: boolean; auto_post_disclaimer_accepted?: boolean;
    posting_frequency: string;
  }

  interface ChannelHomeProps {
    channelId: string;
    onBack: () => void;
    onOpenPipeline: (channelId: string) => void;
  }

  const PLATFORM_EMOJI: Record<string, string> = { youtube: '📺', instagram: '📸', tiktok: '🎵', facebook: '📘', linkedin: '💼' };

  export default function ChannelHome({ channelId, onBack, onOpenPipeline }: ChannelHomeProps) {
    const [channel, setChannel] = useState<Channel | null>(null);
    const [showDisclaimer, setShowDisclaimer] = useState(false);
    const [reviewKey, setReviewKey] = useState(0); // bump to refresh ReviewQueue

    useEffect(() => {
      getAuthHeaders().then(headers =>
        fetch(`${API_BASE_URL}/channels/`, { headers })
          .then(r => r.json())
          .then((channels: Channel[]) => {
            const ch = channels.find(c => c.id === channelId);
            if (ch) setChannel(ch);
          })
          .catch(() => {})
      );
    }, [channelId]);

    const toggleAutoPost = () => {
      if (!channel) return;
      if (!channel.auto_post) {
        // Turning ON — check if disclaimer already accepted
        if (!channel.auto_post_disclaimer_accepted) {
          setShowDisclaimer(true);
          return;
        }
      }
      // Turning OFF — direct update
      getAuthHeaders().then(headers =>
        fetch(`${API_BASE_URL}/channels/${channelId}`, {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ auto_post: !channel.auto_post }),
        }).then(r => r.ok ? setChannel(c => c ? { ...c, auto_post: !c.auto_post } : c) : null)
          .catch(() => {})
      );
    };

    const handleDisclaimerAccepted = () => {
      setShowDisclaimer(false);
      setChannel(c => c ? { ...c, auto_post: true, auto_post_disclaimer_accepted: true } : c);
    };

    if (!channel) return (
      <div className="flex justify-center items-center py-20">
        <div className="h-6 w-6 rounded-full border-2 border-teal-400 border-t-transparent animate-spin" />
      </div>
    );

    return (
      <motion.div
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
        className="space-y-6"
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={onBack}
            className="flex items-center gap-1 text-sm text-white/40 hover:text-white/70 transition-colors">
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <div className="flex items-center gap-2 ml-2">
            <span className="text-lg">{PLATFORM_EMOJI[channel.platform] ?? '📡'}</span>
            <h2 className="text-lg font-semibold text-white">{channel.name}</h2>
            {channel.niche && <span className="text-xs text-white/30">· {channel.niche}</span>}
          </div>
          <div className="ml-auto flex items-center gap-3">
            {/* Auto-post toggle */}
            <button onClick={toggleAutoPost}
              className="flex items-center gap-1.5 text-sm transition-colors"
              title={channel.auto_post ? 'Auto-post ON' : 'Auto-post OFF'}>
              {channel.auto_post
                ? <ToggleRight className="h-5 w-5 text-teal-400" />
                : <ToggleLeft className="h-5 w-5 text-white/30" />}
              <span className={channel.auto_post ? 'text-teal-400 text-xs' : 'text-white/30 text-xs'}>Auto-post</span>
            </button>
            <button onClick={() => onOpenPipeline(channelId)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.07] text-xs text-white/40 hover:text-white/70 hover:border-white/[0.14] transition-all">
              <Settings className="h-3.5 w-3.5" /> Configure
            </button>
          </div>
        </div>

        {/* Main content: review queue + trending sidebar */}
        <div className="flex gap-6">
          <div className="flex-1 min-w-0">
            <ReviewQueue channelId={channelId} key={reviewKey} />
          </div>
          <TrendingFeed channelId={channelId} onVideoQueued={() => setReviewKey(k => k + 1)} />
        </div>

        {/* Disclaimer modal */}
        <AnimatePresence>
          {showDisclaimer && (
            <AutoPostDisclaimer
              channelId={channelId}
              onAccepted={handleDisclaimerAccepted}
              onCancel={() => setShowDisclaimer(false)}
            />
          )}
        </AnimatePresence>
      </motion.div>
    );
  }
  ```

- [ ] **Step 2: Wire ChannelHome into Dashboard.tsx**

  In `Dashboard.tsx`:

  **Add import** near the other channel imports (lines 54-55):
  ```tsx
  import ChannelHome from './channels/ChannelHome';
  ```

  **Add state** after `activePipelineChannel` state (line ~158):
  ```tsx
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  ```

  **Add ChannelHome render** — find the block `{activeTab === 'channels' ? 'block' : 'none'}` (line ~1031). Just before `<ChannelDashboard>`, add:
  ```tsx
  {selectedChannel ? (
    <ChannelHome
      channelId={selectedChannel}
      onBack={() => setSelectedChannel(null)}
      onOpenPipeline={(channelId) => {
        setActivePipelineChannel(channelId);
        setShowPipelineOverlay(true);
      }}
    />
  ) : (
    <ChannelDashboard
      onOpenPipeline={(channelId) => {
        setActivePipelineChannel(channelId);
        setShowPipelineOverlay(true);
      }}
      onOpenChannelHome={(channelId) => setSelectedChannel(channelId)}
    />
  )}
  ```

  **Update ChannelDashboard.tsx** to accept and call `onOpenChannelHome`:
  
  In `ChannelDashboard.tsx`, update the `ChannelDashboardProps` interface:
  ```tsx
  interface ChannelDashboardProps {
    onOpenPipeline: (channelId: string) => void;
    onOpenChannelHome: (channelId: string) => void;
  }
  ```
  
  Update the function signature:
  ```tsx
  export default function ChannelDashboard({ onOpenPipeline, onOpenChannelHome }: ChannelDashboardProps) {
  ```
  
  On the channel card `<motion.div>`, add `onClick`:
  ```tsx
  <motion.div
    key={channel.id}
    onClick={() => onOpenChannelHome(channel.id)}
    className="... cursor-pointer"
    ...
  >
  ```

  Also update `onCreated` in ChannelWizard call (in ChannelDashboard) to call `onOpenChannelHome` instead of `onOpenPipeline`:
  ```tsx
  <ChannelWizard
    onCreated={(channelId) => {
      setShowWizard(false);
      onOpenChannelHome(channelId);
    }}
    onCancel={() => setShowWizard(false)}
  />
  ```

- [ ] **Step 3: Add `onOpenChannelHome` prop to ChannelDashboard.tsx explicitly**

  > This is an atomic breaking change to the ChannelDashboard interface — do it as one edit before any TypeScript check.

  In `ChannelDashboard.tsx`:

  **Before** (existing interface):
  ```tsx
  interface ChannelDashboardProps {
    onOpenPipeline: (channelId: string) => void;
  }
  export default function ChannelDashboard({ onOpenPipeline }: ChannelDashboardProps) {
  ```

  **After**:
  ```tsx
  interface ChannelDashboardProps {
    onOpenPipeline: (channelId: string) => void;
    onOpenChannelHome: (channelId: string) => void;
  }
  export default function ChannelDashboard({ onOpenPipeline, onOpenChannelHome }: ChannelDashboardProps) {
  ```

  Then on the channel card `<motion.div>`:
  ```tsx
  // Find the card's motion.div (it renders channel.name). Add:
  onClick={() => onOpenChannelHome(channel.id)}
  // and add cursor-pointer to its className
  ```

  And update `ChannelWizard`'s `onCreated` callback:
  ```tsx
  // Change: onCreated={(channelId) => { setShowWizard(false); onOpenPipeline(channelId); }}
  // To:
  onCreated={(channelId) => { setShowWizard(false); onOpenChannelHome(channelId); }}
  ```

  After this edit, `Dashboard.tsx` must also pass the new prop. The call site **before** looks like:
  ```tsx
  <ChannelDashboard onOpenPipeline={(channelId) => { ... }} />
  ```
  **After** (with the conditional from Step 2 applied):
  ```tsx
  <ChannelDashboard
    onOpenPipeline={(channelId) => { setActivePipelineChannel(channelId); setShowPipelineOverlay(true); }}
    onOpenChannelHome={(channelId) => setSelectedChannel(channelId)}
  />
  ```

- [ ] **Step 4: TypeScript check**

  ```bash
  cd /tmp/sf-prod/frontend && npx tsc --noEmit 2>&1 | head -30
  ```
  Fix any type errors before proceeding.

- [ ] **Step 5: Smoke test in browser**

  Visit `http://localhost:5180`, navigate to Channels tab. Verify:
  - Clicking a channel card opens ChannelHome (back button visible)
  - Review Queue shows "No videos yet" when empty
  - Trending sidebar shows loading then topics (or "No trends available" in local)
  - Auto-post toggle → disclaimer modal fires if not yet accepted
  - Configure button opens PipelineBuilder overlay
  - "New Channel" → wizard → after creation → ChannelHome opens for new channel

- [ ] **Step 6: Commit**

  ```bash
  cd /tmp/sf-prod
  git add frontend/src/components/channels/ChannelHome.tsx \
           frontend/src/components/channels/ChannelDashboard.tsx \
           frontend/src/components/Dashboard.tsx
  git commit -m "feat(ui): add ChannelHome panel with review queue + trending feed + auto-post gate"
  ```

---

## Final: Push and Verify

- [ ] **Push all commits**

  ```bash
  cd /tmp/sf-prod && git push origin main
  ```

- [ ] **Full stack smoke test**

  ```bash
  # Backend health
  curl -s http://localhost:8000/health | python3 -m json.tool

  # Trending suggestions (no auth)
  curl -s http://localhost:8000/channels/trending-suggestions | python3 -m json.tool | head -20

  # Channel list (with auth bypass)
  curl -s -H "Authorization: Bearer dev-bypass" http://localhost:8000/channels/ | python3 -m json.tool

  # Voice previews (returns 500 without real key, but shape should be correct)
  curl -s -H "Authorization: Bearer dev-bypass" http://localhost:8000/content/voice-previews | python3 -m json.tool | head -10
  ```

- [ ] **Final TypeScript check**

  ```bash
  cd /tmp/sf-prod/frontend && npx tsc --noEmit && echo "✓ No type errors"
  ```

- [ ] **Run all backend tests**

  ```bash
  docker-compose exec -e PYTHONPATH=/app/app backend pytest app/tests/ -v 2>&1 | tail -20
  ```

---

## Summary of all changed files

| File | Action |
|------|--------|
| `backend/app/requirements.txt` | Add `feedparser` |
| `backend/app/utils/db_init.py` | Add `notifications` collection + 3 indexes |
| `backend/app/utils/trending_service.py` | **New** — Google News RSS fetcher |
| `backend/app/worker/notification_tasks.py` | **New** — Celery countdown reminder task |
| `backend/app/routes/channel_routes.py` | 7 new endpoints + 2 helper fns |
| `backend/app/routes/content_routes.py` | Enrich voice-previews response |
| `backend/app/worker/scheduler.py` | Write queued_video record + countdown |
| `frontend/src/components/channels/ChannelWizard.tsx` | **New** — 3-step wizard |
| `frontend/src/components/channels/ChannelHome.tsx` | **New** — per-channel panel |
| `frontend/src/components/channels/ReviewQueue.tsx` | **New** — approve/reject queue |
| `frontend/src/components/channels/TrendingFeed.tsx` | **New** — trending topics sidebar |
| `frontend/src/components/channels/AutoPostDisclaimer.tsx` | **New** — legal gate modal |
| `frontend/src/components/channels/VideoPreviewModal.tsx` | **New** — inline video player |
| `frontend/src/components/channels/ChannelDashboard.tsx` | Wizard + card click wiring |
| `frontend/src/components/Dashboard.tsx` | selectedChannel state + ChannelHome render |
