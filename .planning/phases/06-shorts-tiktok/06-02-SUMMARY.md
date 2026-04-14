---
phase: 06-shorts-tiktok
plan: "02"
subsystem: integrations
tags: [tiktok, oauth, pkce, integrations]
dependency_graph:
  requires: []
  provides: [tiktok-oauth-authorize, tiktok-oauth-callback]
  affects: [06-03-post-to-tiktok]
tech_stack:
  added: []
  patterns: [PKCE-S256, OAuth2-authorization-code, base64-state-encoding]
key_files:
  created: []
  modified:
    - backend/app/routes/integrations_routes.py
decisions:
  - "Inline `import requests as _req` in callback to avoid shadowing the module-level `requests` import used by other route handlers"
  - "PKCE helper uses inline imports (hashlib, secrets, base64) scoped to the function — no new top-level imports needed"
  - "state param encodes user_id + code_verifier as base64 JSON, matching the existing YouTube OAuth pattern exactly"
  - "token_expires_at stored as UTC epoch integer (int(time.time()) + expires_in) for easy comparison downstream"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-14"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 1
---

# Phase 06 Plan 02: TikTok OAuth PKCE Flow Summary

TikTok OAuth 2.0 PKCE authorize + callback endpoints added to integrations_routes.py, mirroring the YouTube OAuth pattern — users can now connect their TikTok accounts and have access_token/refresh_token/open_id stored for use by Plan 03's post-to-tiktok route.

## What Was Built

Two new route handlers appended to `backend/app/routes/integrations_routes.py` (lines 764–876):

1. `_generate_tiktok_pkce_pair()` — helper that generates a PKCE `code_verifier` (url-safe random 64 bytes) and `code_challenge` (S256 = SHA-256 base64url-encoded, no padding).

2. `GET /api/integrations/tiktok/oauth/authorize` — reads the user's stored `clientKey` and `clientSecret` from the integrations collection, generates a PKCE pair, encodes `{user_id, code_verifier}` as base64 JSON state, and returns an `authorization_url` pointing to `https://www.tiktok.com/v2/auth/authorize/` with `scope=video.publish`.

3. `GET /api/integrations/tiktok/oauth/callback` — decodes state to recover `user_id` and `code_verifier`, POSTs to `https://open.tiktokapis.com/v2/oauth/token/`, and stores `accessToken`, `refreshToken`, `openId`, and `tokenExpiresAt` (epoch + `expires_in`) via `integrations_service.save_integration(platform="tiktok")`. On success, redirects to `{FRONTEND_URL}/integrations?tiktok_auth=success`.

## Verification

All 5 plan verification checks passed:

```
1. grep tiktok/oauth — /authorize (line 779) + /callback (line 822) ✓
2. grep TikTok API URLs — tiktok.com/v2/auth/authorize/ (804) + open.tiktokapis.com/v2/oauth/token/ (850) ✓
3. grep tokenExpiresAt/openId/save_integration — lines 869, 870, 871 ✓
4. Python syntax: ast.parse() → "syntax OK" ✓
5. YouTube OAuth routes untouched — /authorize (646) + /callback (705) ✓
```

## Commits

| Hash | Message |
|------|---------|
| f1c836b | feat(06-02): add TikTok OAuth 2.0 PKCE authorize + callback endpoints |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- File modified: `backend/app/routes/integrations_routes.py` — exists and contains all required symbols
- Commit f1c836b — present in git log
- Python syntax: valid (ast.parse confirmed)
- YouTube OAuth routes: untouched
