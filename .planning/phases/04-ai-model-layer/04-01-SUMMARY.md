---
phase: 04-ai-model-layer
plan: 01
subsystem: api
tags: [anthropic, mongodb, fastapi, react, typescript, model-config, elevenlabs, fal-ai]

# Dependency graph
requires:
  - phase: 02-db-schema
    provides: model_configs MongoDB collection + CRUD routes
provides:
  - ModelConfig dataclass with resolve_model_config() resolver (provider_config.py)
  - GET /model-config/providers endpoint (no auth, sorted provider lists)
  - generate_video_concept() accepts model_name param (scene_descriptor_agent.py)
  - generate_marketing_package() + generate_intelligent_prompt_from_company_data() accept model_name param
  - content_routes.py calls resolve_model_config in /generate, /video-remotion/analyze, /video-remotion
  - HTTP 501 guard for unimplemented providers (gemini-2.0-flash, non-elevenlabs voice)
  - useModelConfig React hook (providers fetch + saved config read/write)
affects: [05-voice-pipeline, 06-video-rendering, 08-research-integration, frontend-model-picker]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ModelConfig dataclass with env-var-sourced API keys and safe DB fallback"
    - "resolve_model_config() tries channel-specific doc first, then user-level, then defaults"
    - "Route-level 501 guard pattern for unimplemented providers"
    - "effective_x = body.get('x') or cfg.x — request body wins, saved config as fallback"
    - "GET /providers registered BEFORE /{channel_id} to avoid FastAPI path param capture"

key-files:
  created:
    - backend/app/utils/provider_config.py
    - frontend/src/hooks/useModelConfig.ts
  modified:
    - backend/app/routes/model_config_routes.py
    - backend/app/utils/scene_descriptor_agent.py
    - backend/app/utils/personalised_message.py
    - backend/app/routes/content_routes.py
    - backend/tests/test_model_config_routes.py

key-decisions:
  - "API keys always sourced from env vars — never from DB doc — to avoid credential leakage"
  - "resolve_model_config wraps everything in try/except — DB unavailable must not crash pipeline"
  - "effective_x = body.get('x') or cfg.x pattern — body wins, config is fallback (not override)"
  - "dalle3 provider branches to _generate_scene_dalle_backgrounds via use_veo3=False + fal_model=dalle"
  - "research_provider wiring deferred to phase-08 (TODO comment added)"

patterns-established:
  - "Provider guard pattern: check cfg.script_model / cfg.voice_provider before expensive calls, raise 501 for unimplemented"
  - "useModelConfig hook: /providers (no auth) + /model-config (auth) fetched together on mount"
  - "Module-level anthropic.Anthropic clients moved inside function bodies to respect per-call model config"

requirements-completed: [MODEL-01, MODEL-02, MODEL-03, MODEL-04]

# Metrics
duration: 25min
completed: 2026-04-13
---

# Phase 04 Plan 01: AI Model Layer Summary

**ModelConfig dataclass + resolve_model_config() resolver wires 4 hardcoded AI call sites (Claude script, ElevenLabs voice, Kling video) to read per-channel provider config from MongoDB, with /providers discovery endpoint and useModelConfig React hook**

## Performance

- **Duration:** 25 min
- **Started:** 2026-04-13T00:00:00Z
- **Completed:** 2026-04-13T00:25:00Z
- **Tasks:** 3
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments
- Created `provider_config.py` with `ModelConfig` dataclass + `resolve_model_config()` — safe fallback to defaults when DB unavailable
- Exposed `GET /model-config/providers` (no auth) returning sorted lists of all 4 provider categories; registered before `/{channel_id}` to avoid FastAPI path capture
- Parameterized `generate_video_concept()`, `generate_marketing_package()`, `generate_intelligent_prompt_from_company_data()` with `model_name` — no more hardcoded "claude-sonnet-4-6"
- Removed module-level `anthropic.Anthropic` client from `personalised_message.py`; instantiated inside each call
- Added HTTP 501 guards for `gemini-2.0-flash` and non-elevenlabs voice providers in `analyze_video_remotion_endpoint`
- `effective_voice_id = body.get("voice_id") or cfg.voice_id` and `effective_fal_model = body.get("fal_model") or cfg.fal_model_id` — request body wins, saved config as fallback
- `dalle3` provider routes to `_generate_scene_dalle_backgrounds` via `use_veo3=False, fal_model="dalle"`
- `useModelConfig` TypeScript hook: fetches `/providers` (unauthenticated) + saved config (Clerk auth) on mount; exposes `updateConfig()` 
- Added `test_list_providers` test — 4 total model config tests now pass (was 3)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create provider_config.py + GET /model-config/providers** - `a5d66ec` (feat)
2. **Task 2: Wire 4 call sites to resolve_model_config** - `a46661e` (feat)
3. **Task 3: Frontend hook + /providers test** - `b6819e0` (feat)

## Files Created/Modified
- `backend/app/utils/provider_config.py` - ModelConfig dataclass + resolve_model_config() resolver
- `backend/app/routes/model_config_routes.py` - Added GET /providers endpoint (before /{channel_id})
- `backend/app/utils/scene_descriptor_agent.py` - generate_video_concept accepts model_name param
- `backend/app/utils/personalised_message.py` - Removed module-level client; model_name param on 2 functions
- `backend/app/routes/content_routes.py` - resolve_model_config wired into /generate + /video-remotion/analyze + /video-remotion
- `frontend/src/hooks/useModelConfig.ts` - React hook returning { providers, config, updateConfig, loading, error }
- `backend/tests/test_model_config_routes.py` - Added test_list_providers (no auth headers)

## Decisions Made
- API keys always sourced from env vars, never from DB doc — prevents credential leakage
- `resolve_model_config()` silently falls back to `ModelConfig()` defaults on any exception — DB unavailable must not crash the pipeline
- Route ordering: `/providers` before `/{channel_id}` — FastAPI routes literal strings before path params, so ordering is critical
- `research_provider` wiring deferred to phase-08 (TODO comment added in content_routes.py)
- `dalle3` config value maps to `fal_model="dalle"` + `use_veo3=False` rather than a new code path — reuses existing DALL-E logic

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- PYTHONPATH must include `app/` for direct Python invocations (e.g., `python -c`); tests handled this via `conftest.py` `sys.path.insert`. Used pytest for import smoke tests where possible.

## User Setup Required
None - no external service configuration required. Provider config reads from existing `model_configs` MongoDB collection.

## Next Phase Readiness
- AI pipeline is now model-agnostic per channel — users can save preferences via existing `POST /model-config`
- Frontend can use `useModelConfig` hook to populate model picker UI
- `GET /providers` gives frontend the valid option lists without requiring auth
- Phase 08 (research) can wire `cfg.research_provider` — TODO comment marks the spot in `content_routes.py`

---
*Phase: 04-ai-model-layer*
*Completed: 2026-04-13*
