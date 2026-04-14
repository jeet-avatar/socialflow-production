---
phase: 06-shorts-tiktok
plan: 01
subsystem: remotion-service
tags: [remotion, ssr, video-render, portrait, tiktok, shorts]
dependency_graph:
  requires: []
  provides: [remotion-ssr-pipeline, portrait-composition]
  affects: [content_routes.py _call_remotion_render()]
tech_stack:
  added: [remotion@4.0.435, "@remotion/renderer@4.0.435", "@remotion/bundler@4.0.435", react@18.3.1, react-dom@18.3.1]
  patterns: [startup-bundle-cache, composition-id-routing, 503-until-ready]
key_files:
  created:
    - remotion-service/src/compositions/SocialFlowVideoShorts.tsx
  modified:
    - remotion-service/src/render-server.ts
    - remotion-service/src/index.tsx
    - remotion-service/package.json
    - remotion-service/tsconfig.json
    - remotion-service/src/compositions/SocialFlowVideo.tsx
decisions:
  - "compositionId defaults to SocialFlowVideo — all existing callers unaffected"
  - "bundle() runs once at startup (not per-request) — improves p99 render latency"
  - "503 returned until bundleReady=true — no silent render failures during startup"
  - "Safe-zone wrapper uses CSS padding (15%/8%/25%) inside AbsoluteFill — Remotion scales to 1080x1920 automatically"
metrics:
  duration: "2 minutes"
  completed: "2026-04-14"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 6
---

# Phase 06 Plan 01: Remotion SSR Pipeline + Portrait Composition Summary

Real Remotion SSR render pipeline replacing 501 stub, plus 9:16 portrait composition for TikTok/YouTube Shorts.

## What Was Built

### Task 1: Install Remotion packages + SocialFlowVideoShorts composition
- Installed remotion@4.0.435, @remotion/renderer@4.0.435, @remotion/bundler@4.0.435 with exact-pinned versions (no `^` caret)
- Added @types/react@18.3.1 and @types/react-dom@18.3.1 to devDependencies
- Fixed tsconfig.json to add `jsx: "react"` and `lib: ["ES2020", "DOM"]` — required for .tsx compilation
- Created `SocialFlowVideoShorts.tsx` — portrait 9:16 composition wrapping SocialFlowVideo in a safe-zone padding container (15% top, 8% horizontal, 25% bottom)
- Updated `index.tsx` Root from single Composition to fragment with both landscape (1920x1080) and portrait (1080x1920) compositions registered
- **Commit:** `2de24d4`

### Task 2: Real Remotion SSR render pipeline
- Replaced 501 stub in `render-server.ts` with real `bundle()` + `selectComposition()` + `renderMedia()` pipeline
- Added `initBundle()` called once after `app.listen()` — Remotion WebPack bundle compiled at startup, not per-request
- Added `bundleReady` flag — `GET /health` now returns `{ bundleReady: true }` once compilation finishes
- `POST /render` returns HTTP 503 until bundle is ready, then routes to `compositionId` (defaults to `SocialFlowVideo`)
- Passing `compositionId: "SocialFlowVideoShorts"` renders 1080x1920 portrait MP4 for TikTok/Shorts
- Kept `cleanupFile()` and periodic cleanup setInterval unchanged
- **Commit:** `d1bf2a6`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing @types/react + JSX tsconfig for TypeScript compilation**
- **Found during:** Task 1 (first tsc run)
- **Issue:** tsconfig.json lacked `jsx` compiler option and `DOM` lib; `@types/react` not installed. All .tsx files failed with "Cannot use JSX" and "Could not find declaration file for react".
- **Fix:** Added `@types/react@18.3.1`, `@types/react-dom@18.3.1` to devDependencies; updated tsconfig.json with `"jsx": "react"` and `"lib": ["ES2020", "DOM"]`.
- **Files modified:** `tsconfig.json`, `package.json`
- **Commit:** `2de24d4`

**2. [Rule 1 - Bug] SocialFlowVideoProps interface missing template_video_url, voiceover_duration_seconds, text_layovers**
- **Found during:** Task 1 (tsc after tsconfig fix)
- **Issue:** `index.tsx` defaultProps used `template_video_url`, `voiceover_duration_seconds`, and `text_layovers` fields that were not in the `SocialFlowVideoProps` interface — TypeScript errors TS2353 + TS2339.
- **Fix:** Added three optional fields to the interface in `SocialFlowVideo.tsx`; updated `durationInFrames` expression to use `?? 10` nullish coalescing.
- **Files modified:** `remotion-service/src/compositions/SocialFlowVideo.tsx`, `remotion-service/src/index.tsx`
- **Commit:** `2de24d4`

## Verification Results

1. `npx tsc --noEmit` — zero errors (exit 0)
2. `package.json` remotion/renderer/bundler all at exact `4.0.435` — no `^` caret
3. `grep "501\|not yet implemented" render-server.ts` — no matches
4. Both compositions in `index.tsx`: `id="SocialFlowVideo"` (1920x1080) + `id="SocialFlowVideoShorts"` (1080x1920)
5. `SocialFlowVideoShorts.tsx` exists with `AbsoluteFill` + safe-zone padding wrapper

## Self-Check: PASSED

- SocialFlowVideoShorts.tsx: FOUND
- render-server.ts: FOUND
- index.tsx: FOUND
- package.json: FOUND
- Commit 2de24d4: FOUND
- Commit d1bf2a6: FOUND
