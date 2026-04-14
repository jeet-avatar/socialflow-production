# Phase 06: Shorts + TikTok - Research

**Researched:** 2026-04-14
**Domain:** Remotion vertical video composition (9:16) + TikTok Content Posting API v2 OAuth + YouTube Shorts upload
**Confidence:** MEDIUM-HIGH (Remotion patterns HIGH via official docs; TikTok API MEDIUM — app approval gating limits sandbox testing)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SHORTS-01 | Add 9:16 Remotion composition (SocialFlowVideoShorts) registered in index.tsx alongside existing 1920x1080 composition | Remotion multi-composition pattern confirmed; `width=1080, height=1920` in `<Composition>` tag; render server needs `compositionId` param to select which to render |
| SHORTS-02 | Implement actual Remotion SSR rendering in render-server.ts using `@remotion/renderer` + `@remotion/bundler` (currently returns 501 stub) | `bundle()` + `selectComposition()` + `renderMedia()` pattern documented; must install `@remotion/renderer @remotion/bundler remotion react react-dom` |
| SHORTS-03 | TikTok Content Posting API v2 OAuth flow (authorize + callback) wired into integrations_routes.py following same YouTube pattern | OAuth 2.0 PKCE flow documented; auth URL `https://www.tiktok.com/v2/auth/authorize/`; token endpoint `https://open.tiktokapis.com/v2/oauth/token/`; scope `video.publish`; 24h access token, 365d refresh token |
| SHORTS-04 | TikTok post helper (`tiktok_post_helper.py`) + POST `/post-to-tiktok` route wired into content_routes.py; uses PULL_FROM_URL with verified CloudFront domain (preferred) or FILE_UPLOAD chunked fallback | Direct Post endpoint `POST https://open.tiktokapis.com/v2/post/publish/video/init/`; status polling `POST /v2/post/publish/status/fetch/`; CloudFront domain `d2nbx2qjod9qta.cloudfront.net` must be verified in TikTok dev dashboard |
</phase_requirements>

---

## Summary

Phase 06 has two distinct technical tracks that must be coordinated: (1) Remotion composition work in the Node.js render service, and (2) TikTok API integration in the Python backend.

**Track A — Remotion**: The render-server.ts currently returns a 501 stub (this is intentional from prior phases). Phase 06 must implement the actual `bundle()` + `selectComposition()` + `renderMedia()` SSR pipeline using `@remotion/renderer` and `@remotion/bundler`. A second Composition `SocialFlowVideoShorts` (1080×1920, 9:16) must be registered in `index.tsx` alongside the existing `SocialFlowVideo` (1920×1080). The render endpoint needs a `compositionId` parameter so callers select which format to render. The 9:16 composition can reuse existing templates but layout must account for portrait safe zones (keep critical content in top 15%–75% height range, away from TikTok UI overlay areas).

**Track B — TikTok**: TikTok has no drop-in Python library for the Content Posting API v2 — build a `tiktok_post_helper.py` modeled on the existing `youtube_post_helper.py`. The TikTok OAuth flow (PKCE + `video.publish` scope) is added to `integrations_routes.py` as `/tiktok/oauth/authorize` and `/tiktok/oauth/callback` endpoints, same architectural pattern as YouTube OAuth. The SocialFlow videos are already stored on CloudFront (`d2nbx2qjod9qta.cloudfront.net`); using `PULL_FROM_URL` avoids chunked upload complexity **but requires domain verification in TikTok for Developers dashboard first**. If domain verification isn't done, fall back to `FILE_UPLOAD` chunked mode.

**Critical dependency**: SHORTS-02 (rendering the 501 stub into a real render) must land before SHORTS-01 is testable end-to-end, but they can be built in parallel. SHORTS-03 (TikTok OAuth) must land before SHORTS-04 (posting) is functional.

**Primary recommendation:** Implement Track A first (Remotion SSR + 9:16 composition) since it unblocks video generation for all formats, then Track B (TikTok OAuth + posting). The 9:16 format video works for YouTube Shorts AND TikTok — generate once, publish both.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `remotion` | 4.0.435 (match frontend) | React composition framework | Already installed in frontend; must use exact same version in render service |
| `@remotion/renderer` | 4.0.435 | `renderMedia()` + `selectComposition()` SSR | Official server-side render API |
| `@remotion/bundler` | 4.0.435 | `bundle()` webpack compilation | Required before `renderMedia()` can run |
| `react` | 18.x | JSX runtime for Remotion compositions | Remotion requires React 18 |
| `react-dom` | 18.x | Required peer dep for Remotion renderer | Same version as react |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `httpx` (Python) | already in requirements.txt | Async HTTP for TikTok API calls | Use for TikTok API calls (already installed) |
| `requests` (Python) | already in requirements.txt | Sync HTTP for TikTok OAuth token exchange | Use for simple token exchange (sync is fine) |
| `imageio-ffmpeg` (Python) | already in requirements.txt | FFmpeg for portrait transcoding | Already used for Instagram portrait transcode |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `PULL_FROM_URL` (TikTok) | `FILE_UPLOAD` chunked | PULL_FROM_URL is simpler, no bandwidth cost, but requires CloudFront domain verification in TikTok dashboard; FILE_UPLOAD works without domain verification but needs chunked PUT requests |
| Remotion SSR in render-server | Remotion Lambda | Lambda = $0.01/render auto-scale; SSR = simpler ops, no AWS Lambda cold starts; use SSR for Phase 06 since infra is already the simple render-server model |
| Build new 9:16 templates | Reuse existing 20 templates | Building new templates is scope creep; reuse existing templates with portrait-adapted CSS (AbsoluteFill auto-scales to composition dimensions) |

**Installation (render service):**
```bash
cd /tmp/sf-prod/remotion-service
npm install remotion@4.0.435 @remotion/renderer@4.0.435 @remotion/bundler@4.0.435 react@18 react-dom@18
```

**Critical:** All `remotion` and `@remotion/*` packages must be the SAME exact version. Remove the `^` caret from `package.json` to pin exact versions. Mismatched versions cause silent rendering failures.

---

## Architecture Patterns

### Recommended Project Structure Changes
```
remotion-service/
├── src/
│   ├── index.tsx               # MODIFIED: register both Compositions
│   ├── render-server.ts        # MODIFIED: implement real renderMedia() pipeline
│   ├── compositions/
│   │   ├── SocialFlowVideo.tsx      # EXISTING: 1920x1080 landscape
│   │   └── SocialFlowVideoShorts.tsx  # NEW: 1080x1920 portrait 9:16
│   ├── components/             # EXISTING: reused unchanged
│   └── templates/              # EXISTING: reused unchanged

backend/app/
├── utils/
│   └── tiktok_post_helper.py   # NEW: mirrors youtube_post_helper.py pattern
├── routes/
│   ├── integrations_routes.py  # MODIFIED: add /tiktok/oauth/authorize + /callback
│   └── content_routes.py       # MODIFIED: add POST /post-to-tiktok route
└── tests/
    ├── test_tiktok_helper.py   # NEW
    └── test_shorts_render.py   # NEW
```

### Pattern 1: Registering Multiple Remotion Compositions (Different Dimensions)

**What:** Two `<Composition>` components in `registerRoot()`, one landscape and one portrait.
**When to use:** Any time a project needs multiple output formats from the same template system.

```typescript
// Source: https://www.remotion.dev/docs/composition
import { registerRoot, Composition } from 'remotion';
import React from 'react';
import SocialFlowVideo, { FPS, SocialFlowVideoProps } from './compositions/SocialFlowVideo';
import SocialFlowVideoShorts from './compositions/SocialFlowVideoShorts';

const Root: React.FC = () => (
  <>
    <Composition
      id="SocialFlowVideo"
      component={SocialFlowVideo as any}
      durationInFrames={Math.ceil(30 * FPS)}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={landscapeDefaultProps}
    />
    <Composition
      id="SocialFlowVideoShorts"
      component={SocialFlowVideoShorts as any}
      durationInFrames={Math.ceil(30 * FPS)}
      fps={FPS}
      width={1080}    // 9:16 portrait
      height={1920}
      defaultProps={shortsDefaultProps}
    />
  </>
);

registerRoot(Root);
```

### Pattern 2: Real Remotion SSR Pipeline in render-server.ts

**What:** `bundle()` → `selectComposition()` → `renderMedia()` replacing the 501 stub.
**When to use:** Any server-side video rendering.

```typescript
// Source: https://www.remotion.dev/docs/ssr-node
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path from 'path';

// Bundle once at startup, reuse for all renders
let bundleLocation: string | null = null;

async function getBundle(): Promise<string> {
  if (!bundleLocation) {
    bundleLocation = await bundle({
      entryPoint: path.resolve(__dirname, '../src/index.tsx'),
    });
  }
  return bundleLocation;
}

// In POST /render handler:
const serveUrl = await getBundle();
const compositionId = req.body.compositionId ?? 'SocialFlowVideo'; // default landscape

const composition = await selectComposition({
  serveUrl,
  id: compositionId,
  inputProps: req.body,
});

const outputPath = `/tmp/socialflow-${Date.now()}.mp4`;
await renderMedia({
  composition,
  serveUrl,
  codec: 'h264',
  outputLocation: outputPath,
  inputProps: req.body,
});
```

**Key:** The `compositionId` in the POST body selects `SocialFlowVideo` (1920x1080) or `SocialFlowVideoShorts` (1080x1920). The Python backend passes `compositionId` in the render payload, defaulting to landscape.

### Pattern 3: TikTok OAuth (mirroring YouTube OAuth pattern)

**What:** PKCE-based OAuth 2.0 for `video.publish` scope stored in integrations collection.
**When to use:** TikTok integration setup.

```python
# Source: https://developers.tiktok.com/doc/oauth-user-access-token-management
# Authorization URL
auth_url = (
    "https://www.tiktok.com/v2/auth/authorize/"
    f"?client_key={client_key}"
    f"&scope=video.publish"
    f"&response_type=code"
    f"&redirect_uri={redirect_uri}"
    f"&state={state}"
    f"&code_challenge={code_challenge}"
    f"&code_challenge_method=S256"
)

# Token exchange
resp = requests.post(
    "https://open.tiktokapis.com/v2/oauth/token/",
    headers={"Content-Type": "application/x-www-form-urlencoded"},
    data={
        "client_key": client_key,
        "client_secret": client_secret,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri,
        "code_verifier": code_verifier,
    }
)
# Response: {"access_token": ..., "refresh_token": ..., "open_id": ..., "expires_in": 86400}
```

**Token lifetime:** access_token = 24 hours, refresh_token = 365 days. Refresh with `grant_type=refresh_token`. Store `open_id` — it's required for every API call alongside `access_token`.

### Pattern 4: TikTok Direct Post via PULL_FROM_URL

**What:** Post a video already on CloudFront to TikTok without re-uploading the bytes.
**When to use:** Video is already stored in S3/CloudFront (our case).

```python
# Source: https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
resp = requests.post(
    "https://open.tiktokapis.com/v2/post/publish/video/init/",
    headers={
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json; charset=UTF-8",
    },
    json={
        "post_info": {
            "title": caption,          # max 2200 UTF-16 chars; supports #hashtags
            "privacy_level": "PUBLIC_TO_EVERYONE",  # or SELF_ONLY for unaudited apps
            "disable_duet": False,
            "disable_stitch": False,
            "disable_comment": False,
        },
        "source_info": {
            "source": "PULL_FROM_URL",
            "video_url": cloudfront_video_url,
        }
    }
)
publish_id = resp.json()["data"]["publish_id"]

# Poll status
while True:
    status_resp = requests.post(
        "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
        headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json; charset=UTF-8"},
        json={"publish_id": publish_id}
    )
    status = status_resp.json()["data"]["status"]
    if status == "PUBLISH_COMPLETE":
        break
    elif status == "FAILED":
        raise Exception(status_resp.json()["data"]["fail_reason"])
    time.sleep(5)
```

### Pattern 5: YouTube Shorts — same API, different signal

**What:** Upload a 9:16 vertical video to YouTube and signal Shorts via title/description.
**When to use:** Publishing 9:16 video to YouTube.

```python
# Source: youtube_post_helper.py pattern (already in codebase)
# YouTube has no separate Shorts endpoint — use videos.insert()
# Shorts detection: duration ≤ 60s AND 9:16 aspect ratio → auto-classified as Short
# Add #Shorts to title for discovery (not required for classification)
body = {
    "snippet": {
        "title": f"{title} #Shorts",
        "description": description,
        "categoryId": "22"
    },
    "status": {
        "privacyStatus": "public",
        "selfDeclaredMadeForKids": False,
    }
}
# Same MediaFileUpload + resumable=True pattern as existing helper
```

### 9:16 Composition — Safe Zone Layout

**What:** Portrait-adapted React layout for vertical video.
**Key constraint:** TikTok/Shorts UI overlays occupy bottom 20% (engagement buttons) and right 10% (follow button). Keep text/logos in safe zone: 15%–75% of height, center-horizontal.

```typescript
// SocialFlowVideoShorts.tsx — safe zone guidance
const SAFE_TOP = '15%';     // Below status bar
const SAFE_BOTTOM = '25%';  // Above TikTok UI overlay (like/comment/share)
const SAFE_HORIZONTAL = '8%'; // Avoid right-side profile button column
```

### Anti-Patterns to Avoid

- **Mismatched Remotion versions:** Never have `remotion@4.0.400` and `@remotion/renderer@4.0.435` — always pin exact same version across all `remotion` packages.
- **Caret `^` in remotion package versions:** `^4.0.435` will drift to newer minor versions on `npm install`, breaking cross-package compatibility. Use exact: `"remotion": "4.0.435"`.
- **Using TikTok v1 API:** The v1 `open-api.tiktok.com` endpoints are deprecated and removed. Use v2 `open.tiktokapis.com` exclusively.
- **Storing TikTok `open_id` separately from `access_token`:** Both are needed for every API call. Store them together in the integrations collection.
- **Re-bundling on every render:** `bundle()` is expensive (webpack compilation). Call it once at server startup (or cache the bundle path), not per-request.
- **Landscape templates in portrait frame:** Existing 20 templates use `AbsoluteFill` which auto-scales to composition dimensions. Test each template at 1080x1920 — some with heavy `position: absolute` elements may need portrait overrides.
- **Assuming PULL_FROM_URL works without domain verification:** TikTok blocks unverified domains. `d2nbx2qjod9qta.cloudfront.net` must be registered in TikTok for Developers dashboard. Implement FILE_UPLOAD chunked as fallback.
- **Posting publicly with unaudited app:** Unaudited TikTok apps can only post `SELF_ONLY`. Content must be manually set to public after posting, or the app must pass TikTok's audit.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Video encoding/rendering | Custom ffmpeg pipeline for video generation | Remotion `renderMedia()` | Handles frame rendering, audio sync, codec, MP4 muxing |
| PKCE code verifier/challenge generation | Custom base64url + SHA-256 | Python `secrets` + `hashlib` (stdlib only, no package) | PKCE is just `base64url(sha256(code_verifier))` — two stdlib calls |
| Portrait video from landscape | Custom ffmpeg transcode after Remotion render | Remotion `width=1080, height=1920` composition | Render native portrait — avoid double-encode quality loss |
| TikTok chunked upload chunk splitting | Custom byte splitter | `file.read(chunk_size)` loop | Simple loop; TikTok just needs `Content-Range: bytes 0-{size-1}/{total}` header |

**Key insight:** Remotion handles the complex video+audio render pipeline; the Python backend only needs to orchestrate API calls. Don't build what's already done.

---

## Common Pitfalls

### Pitfall 1: Remotion Bundle Not Initialized Before Render Request

**What goes wrong:** First render request after server startup fails because `bundle()` hasn't completed (it takes 10-30 seconds for webpack).
**Why it happens:** `bundle()` is async and slow — if called in the request handler, the first request times out.
**How to avoid:** Call `bundle()` during server startup (before `app.listen()`), cache the bundle path in memory. Add a `/health` check that returns `ready: false` until bundle is ready.
**Warning signs:** First POST `/render` after service restart fails with webpack-related error or timeout.

### Pitfall 2: TikTok `open_id` Required But Often Forgotten

**What goes wrong:** API calls return 401/403 even with a valid `access_token`.
**Why it happens:** Every TikTok API call requires `open_id` (the user's TikTok account ID) in the request. It comes back with the token in the OAuth response but is often not stored.
**How to avoid:** Store `open_id` alongside `access_token` and `refresh_token` in the integrations collection.
**Warning signs:** TikTok API returns `{"error":{"code":"access_token_invalid",...}}` despite token being fresh.

### Pitfall 3: TikTok Privacy Level Mismatch

**What goes wrong:** API call succeeds (200) but video is posted as private or upload is silently rejected.
**Why it happens:** Unaudited TikTok apps can ONLY post `SELF_ONLY`. Sending `PUBLIC_TO_EVERYONE` before app audit approval returns an error or overrides to private.
**How to avoid:** Always call `GET /v2/research/creator/info/` (requires `user.info.basic` scope) or `POST /v2/post/publish/creator_info/query/` first to get allowed `privacy_level` options for that user. Default to `SELF_ONLY` for unaudited apps.
**Warning signs:** Post succeeds but video is invisible; check TikTok app review status.

### Pitfall 4: PULL_FROM_URL Domain Not Verified

**What goes wrong:** TikTok POST `/v2/post/publish/video/init/` with `source: "PULL_FROM_URL"` returns error: domain not verified.
**Why it happens:** TikTok requires all pull domains (including CloudFront) to be pre-registered in the TikTok for Developers dashboard.
**How to avoid:** Register `d2nbx2qjod9qta.cloudfront.net` in TikTok developer dashboard under URL Properties BEFORE testing. Alternatively implement FILE_UPLOAD as fallback.
**Warning signs:** Error body contains "domain_not_verified" or "url_not_allowed".

### Pitfall 5: Remotion Version Lock Drift

**What goes wrong:** `npm install` updates one Remotion package to a newer minor version while others stay pinned, causing `Cannot find composition` or `Input props validation failed` errors.
**Why it happens:** `^4.0.x` semver range allows minor updates.
**How to avoid:** Pin exact versions in `package.json` (no `^`). Lock file must be committed.
**Warning signs:** Works locally but fails in Docker; or works in CI but fails locally.

### Pitfall 6: TikTok Access Token 24-Hour Expiry

**What goes wrong:** TikTok posting silently fails after 24 hours.
**Why it happens:** TikTok access tokens expire in 24 hours (unlike YouTube refresh tokens which last indefinitely until revoked). The `refresh_token` lasts 365 days.
**How to avoid:** Add token refresh logic to `tiktok_post_helper.py`. Before each API call, check `token_expires_at` (stored in integrations); if within 60 minutes of expiry, call `https://open.tiktokapis.com/v2/oauth/token/` with `grant_type=refresh_token`.
**Warning signs:** Posts work day 1, fail day 2.

### Pitfall 7: Portrait Composition With Landscape Templates

**What goes wrong:** 9:16 video renders with templates that look wrong in portrait (elements cut off, logos in wrong position).
**Why it happens:** Existing 20 templates were designed and tested for 1920x1080 only. Some use absolute pixel positions that don't scale correctly to 1080x1920.
**How to avoid:** Create `SocialFlowVideoShorts.tsx` as a NEW composition component. Verify each template type renders acceptably at 1080x1920 in Remotion Studio before shipping. Templates using `AbsoluteFill` + `position: relative` + percentages will work; templates with hardcoded pixel offsets need override styles.
**Warning signs:** Scene cards appear cropped or logos are off-screen.

---

## Code Examples

Verified patterns from official sources:

### Remotion Server-Side Render (TypeScript)
```typescript
// Source: https://www.remotion.dev/docs/ssr-node
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path from 'path';

// startup: cache bundle
const bundleDir = await bundle({
  entryPoint: path.resolve(__dirname, '../src/index.tsx'),
});

// per-request render
app.post('/render', async (req, res) => {
  const { compositionId = 'SocialFlowVideo', ...inputProps } = req.body;
  
  const composition = await selectComposition({
    serveUrl: bundleDir,
    id: compositionId,
    inputProps,
  });
  
  const outputPath = `/tmp/socialflow-${Date.now()}.mp4`;
  await renderMedia({
    composition,
    serveUrl: bundleDir,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps,
  });
  
  res.json({ output_path: outputPath });
});
```

### TikTok OAuth PKCE Helper (Python)
```python
# Source: https://developers.tiktok.com/doc/oauth-user-access-token-management
import hashlib, secrets, base64

def _generate_pkce_pair():
    code_verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(code_verifier.encode()).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b'=').decode()
    return code_verifier, code_challenge
```

### TikTok Token Refresh (Python)
```python
# Source: https://developers.tiktok.com/doc/oauth-user-access-token-management
def _refresh_tiktok_token(client_key, client_secret, refresh_token):
    resp = requests.post(
        "https://open.tiktokapis.com/v2/oauth/token/",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={
            "client_key": client_key,
            "client_secret": client_secret,
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        }
    )
    data = resp.json()
    return data["access_token"], data["refresh_token"], data["expires_in"]
```

### TikTok FILE_UPLOAD Chunked (Python fallback)
```python
# Source: https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide
CHUNK_SIZE = 10 * 1024 * 1024  # 10MB chunks (5MB min, 64MB max)

def _upload_file_to_tiktok(upload_url, file_path):
    file_size = os.path.getsize(file_path)
    chunks_sent = 0
    with open(file_path, 'rb') as f:
        while True:
            chunk = f.read(CHUNK_SIZE)
            if not chunk:
                break
            start = chunks_sent * CHUNK_SIZE
            end = start + len(chunk) - 1
            requests.put(
                upload_url,
                headers={
                    "Content-Range": f"bytes {start}-{end}/{file_size}",
                    "Content-Length": str(len(chunk)),
                },
                data=chunk
            )
            chunks_sent += 1
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| TikTok v1 API (`open-api.tiktok.com`) | TikTok v2 API (`open.tiktokapis.com`) | 2023 deprecation, 2024 removal | Must use v2 exclusively; all v1 code examples on the web are outdated |
| TikTok video upload scope: `video.upload` | Direct Post uses `video.publish` scope | v2 redesign | Two scopes exist: `video.publish` (Direct Post, public) vs `video.upload` (inbox/draft); use `video.publish` for automated posting |
| Remotion HTTP API render server (custom) | Remotion SSR with `@remotion/renderer` | Remotion v3+ | The `renderMedia()` API is the current standard; the older `renderFrames` + `stitchFramesToVideo` pattern is legacy |
| YouTube Shorts: add hashtag `#shorts` | YouTube Shorts: 9:16 aspect ratio + ≤60s duration | Stable | YouTube auto-classifies Shorts by format; `#Shorts` in title helps discovery but isn't required |

**Deprecated/outdated:**
- TikTok v1 API: completely removed; any Python examples using `open-api.tiktok.com` are invalid
- Remotion `renderFrames()` + `stitchFramesToVideo()` separate calls: superseded by `renderMedia()` (which combines both)
- `CELERY_TASK_ALWAYS_EAGER`: deprecated in Celery 5.x (noted in existing codebase — confirmed)

---

## Open Questions

1. **TikTok Domain Verification for PULL_FROM_URL**
   - What we know: CloudFront domain `d2nbx2qjod9qta.cloudfront.net` is where videos are stored; TikTok requires domain pre-registration
   - What's unclear: Can we register a CloudFront subdomain (not our own domain) with TikTok? Or does the domain need DNS control (TXT record)?
   - Recommendation: Implement FILE_UPLOAD as the primary path initially (no domain verification needed), add PULL_FROM_URL as an optimization once domain is verified. This avoids blocking the feature on an ops task.

2. **TikTok App Audit Requirement**
   - What we know: Unaudited apps can only post `SELF_ONLY` visibility
   - What's unclear: How long does TikTok's audit process take? What does it require?
   - Recommendation: Default privacy to `SELF_ONLY` in code; document that users must apply for TikTok API audit before public posts work. Note in UI.

3. **Remotion Bundle in Docker**
   - What we know: `bundle()` uses webpack under the hood; Docker build won't have the pre-compiled bundle
   - What's unclear: Should bundle happen at Docker build time (COPY pre-built bundle) or at container startup?
   - Recommendation: Bundle at container startup (after `app.listen()`), set a `bundleReady` flag, return 503 until ready. This avoids Docker layer cache invalidation on every code change.

4. **Portrait template visual quality**
   - What we know: All 20 existing templates were designed for 1920x1080
   - What's unclear: Which templates degrade gracefully at 1080x1920 and which need custom overrides?
   - Recommendation: `SocialFlowVideoShorts` should start with a curated subset of 5–8 templates proven to work in portrait. Test all 20 in Remotion Studio locally, mark incompatible ones, restrict composerIds to the verified subset.

---

## Sources

### Primary (HIGH confidence)
- `https://www.remotion.dev/docs/composition` — Multiple composition registration, width/height props
- `https://www.remotion.dev/docs/ssr-node` — `bundle()` + `selectComposition()` + `renderMedia()` SSR pipeline
- `https://www.remotion.dev/docs/renderer/render-media` — `renderMedia()` API reference
- Existing codebase: `/tmp/sf-prod/remotion-service/src/index.tsx` — Confirmed composition ID `SocialFlowVideo`, 1920x1080, FPS=30
- Existing codebase: `/tmp/sf-prod/remotion-service/src/render-server.ts` — Confirmed 501 stub at `POST /render`, cleanup logic present
- Existing codebase: `/tmp/sf-prod/backend/app/utils/youtube_post_helper.py` — OAuth pattern to mirror for TikTok
- Existing codebase: `/tmp/sf-prod/backend/app/routes/integrations_routes.py` — YouTube OAuth flow pattern (lines 646–780)
- Existing codebase: `/tmp/sf-prod/backend/app/routes/content_routes.py` — `render_payload` structure (line 2293), `_call_remotion_render()` (line 1213)

### Secondary (MEDIUM confidence)
- `https://developers.tiktok.com/doc/content-posting-api-reference-direct-post` — Direct Post endpoint, `post_info` fields, `privacy_level` values
- `https://developers.tiktok.com/doc/oauth-user-access-token-management` — OAuth PKCE token exchange, 24h access token, 365d refresh token
- `https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide` — Video specs (MP4/H264, 360–4096px, 23–60fps, 4GB max, 5–64MB chunks)
- `https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status` — Status polling values (PROCESSING_DOWNLOAD, PUBLISH_COMPLETE, FAILED)
- `https://developers.tiktok.com/doc/content-posting-api-reference-query-creator-info` — `privacy_level` options, `max_video_post_duration_sec`

### Tertiary (LOW confidence)
- Community examples for TikTok Python PULL_FROM_URL — patterns verified against official docs but not tested against live API; treat as guidance

---

## Metadata

**Confidence breakdown:**
- Remotion composition + SSR rendering: HIGH — official Remotion docs verified, patterns used in existing frontend, render-server.ts stub analyzed
- TikTok OAuth flow: MEDIUM — official TikTok docs verified but TikTok API is gated behind app review; sandbox behavior may differ
- TikTok posting (PULL_FROM_URL/FILE_UPLOAD): MEDIUM — endpoints and parameters confirmed from official docs; domain verification is an ops blocker
- YouTube Shorts: HIGH — existing YouTube helper is already working; only change is adding `#Shorts` to title and ensuring 9:16 aspect
- Architecture patterns: HIGH — directly derived from existing codebase analysis (youtube_post_helper.py, content_routes.py, integrations_routes.py)

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (TikTok API changes frequently; re-verify TikTok-specific endpoints before starting)
