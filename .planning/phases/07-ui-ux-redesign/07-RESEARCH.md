# Phase 07: UI/UX Redesign - Research

**Researched:** 2026-04-14
**Domain:** React 18 + TypeScript + Tailwind CSS frontend — channel dashboard, pipeline builder, model picker
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UI-01 | Channel dashboard — list channels, show status (platform, niche, posting frequency, auto-post toggle, last post, next scheduled post) | channels API (GET /channels) is complete; ChannelDashboard component does not exist yet; must be added to Dashboard.tsx nav + rendered as a tab |
| UI-02 | Pipeline builder — per-channel configuration of the full content pipeline (script model, voice, video background provider, posting frequency, auto-post) | model_config_routes + channel_routes both exist; useModelConfig hook already built; PipelineBuilder component does not exist; must save via POST /model-config + PUT /channels/{id} |
| UI-03 | Model picker — a reusable dropdown/card UI that selects script model, voice provider, video background provider from the /providers list | GET /model-config/providers returns all valid values; ModelPicker component does not exist; useModelConfig.providers is already fetched; must render provider lists as selectable cards or dropdowns |
</phase_requirements>

---

## Summary

Phase 07 adds three new UI surfaces to the existing SocialFlow dashboard: a channel dashboard, a pipeline builder, and a model picker. All required backend APIs are already built in previous phases (channel_routes.py, model_config_routes.py from Phase 02; useModelConfig hook from Phase 04). This phase is a pure frontend build — no new backend routes required.

The existing frontend is React 18 + TypeScript + Vite + Tailwind CSS 3.4 with framer-motion for animations, lucide-react for icons, and Clerk for auth. The design system is already defined: dark theme (#080a0f background, blue/teal/cyan accents), glass-panel card pattern, DM Sans body font, Bricolage Grotesque display font. All new components must match this design system exactly. No new design libraries should be added.

The Dashboard.tsx component renders all tabs via `activeTab` state (`display: block/none` switching). The pattern for adding a new tab is: add an entry to the nav items array, add a `display` block in the main content area, and create a standalone component file. The three new components (ChannelDashboard, PipelineBuilder, ModelPicker) follow the same pattern as existing components like SocialIntegration.tsx and SeedanceStudio.tsx.

**Primary recommendation:** Build ChannelDashboard.tsx + PipelineBuilder.tsx + ModelPicker.tsx as standalone components that plug into Dashboard.tsx's existing tab system. Use the existing useModelConfig hook, extend it if needed for per-channel saves. Zero new dependencies.

---

## Standard Stack

### Core (already in package.json — do not add)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | ^18.3.1 | UI rendering | Existing project base |
| typescript | ^5.5.3 | Type safety | Existing project base |
| tailwindcss | ^3.4.1 | Utility styling | Existing project base |
| framer-motion | ^12.23.24 | Animations (AnimatePresence, motion.div) | Already used in VideoStudio, SocialIntegration |
| lucide-react | ^0.344.0 | Icons | All existing components use this — never import from other icon libs |
| @clerk/clerk-react | ^5.61.4 | Auth (useAuth, getToken) | Active auth system; useModelConfig already uses it |

### Supporting (already present — use as-is)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| useModelConfig hook | (local) | Fetches /providers + /model-config/{channelId}, exposes updateConfig | Model picker and pipeline builder both use this |
| axios | ^1.13.1 | HTTP client | Use for channel CRUD calls (GET/POST/PUT/DELETE /channels) |
| API_BASE_URL | config/api.ts | Backend base URL | Import from `../../config/api` in all new components |
| getAuthHeaders | utils/getAuthToken.ts | Returns Authorization header object | Use for all authenticated fetch/axios calls |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Tailwind utility classes | CSS modules or styled-components | Not applicable — Tailwind is established, don't add alternatives |
| framer-motion | CSS transitions only | framer-motion is already a dep; use it for enter/exit animations consistent with other components |
| Hand-written form state | react-hook-form | Not worth adding a dep — forms here are simple (3-5 fields); use useState |

**Installation:** No new packages needed. All dependencies are already installed.

---

## Architecture Patterns

### Recommended Project Structure for Phase 07

```
frontend/src/components/
├── channels/
│   ├── ChannelDashboard.tsx     # UI-01: list + manage channels
│   ├── PipelineBuilder.tsx      # UI-02: per-channel pipeline config
│   └── ModelPicker.tsx          # UI-03: reusable model/provider selector
└── Dashboard.tsx                # (existing) — add nav entry + tab render
```

No new directories needed beyond `channels/`. Follow the same pattern as `videostudio/` subdirectory.

### Pattern 1: Tab Integration into Dashboard.tsx

**What:** Dashboard renders all top-level views via activeTab state. Three additions needed: nav item, display block, component import.

**When to use:** Every new top-level view in the app.

**Example (existing pattern from Dashboard.tsx:802-819):**
```typescript
// 1. Add to nav items array (Dashboard.tsx ~line 802)
{ id: 'channels', icon: Workflow, label: 'Channels' },

// 2. Add display block in main content area (Dashboard.tsx ~line 1009)
<div style={{ display: activeTab === 'channels' ? 'block' : 'none' }}>
  <ChannelDashboard onOpenPipeline={(channelId) => {
    setActivePipelineChannel(channelId);
    setActiveTab('pipeline');
  }} />
</div>
<div style={{ display: activeTab === 'pipeline' ? 'block' : 'none' }}>
  <PipelineBuilder channelId={activePipelineChannel} />
</div>
```

**Note:** The `display: block/none` pattern (not conditional rendering) is used for VideoStudio to preserve state. Use the same pattern for ChannelDashboard to avoid remounting on tab switches.

### Pattern 2: Authenticated API Calls

**What:** All channel CRUD calls need the Clerk JWT in Authorization header.

**When to use:** Every API call in new components.

**Example (pattern from useModelConfig.ts + getAuthToken.ts):**
```typescript
import { getAuthHeaders } from '../../utils/getAuthToken';
import { API_BASE_URL } from '../../config/api';

// Fetch channels
const headers = await getAuthHeaders();
const res = await fetch(`${API_BASE_URL}/channels/`, { headers });
const channels = await res.json();

// Create channel
const res = await fetch(`${API_BASE_URL}/channels/`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name, platform, niche, posting_frequency, auto_post }),
});
```

### Pattern 3: Glass Card Component Pattern

**What:** All cards in the dark theme use the `glass-panel` CSS class or an inline `background: rgba(255,255,255,0.04)` + `border: 1px solid rgba(255,255,255,0.065)` + `backdrop-filter: blur(14px)` pattern.

**When to use:** Every card/panel in new components.

**Example (from VideoStudioConfigPopup.tsx):**
```typescript
const optCard = (active: boolean) =>
  `rounded-xl border transition-all cursor-pointer ${
    active
      ? 'border-teal-500/40 bg-teal-500/[0.08]'
      : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]'
  }`;
```

Active state = teal highlight (`border-teal-500/40 bg-teal-500/[0.08]`). Inactive = glass white. This must be used for ModelPicker card selection.

### Pattern 4: useModelConfig Hook Usage

**What:** The hook from Phase 04 already fetches /providers and /model-config/{channelId}. PipelineBuilder and ModelPicker both consume it.

**When to use:** Any component that needs to read or write model config.

```typescript
// Source: frontend/src/hooks/useModelConfig.ts
import { useModelConfig } from '../../hooks/useModelConfig';

// In PipelineBuilder:
const { providers, config, updateConfig, loading, error } = useModelConfig(channelId);

// Save on submit:
await updateConfig({
  channel_id: channelId,
  script_model: selectedScript,
  voice_provider: selectedVoice,
  video_bg_provider: selectedVideoBg,
});
```

### Pattern 5: Channel API Contract

**What:** The backend channel_routes.py is complete. Frontend must conform to these exact field names.

**Channel object shape (from channel_routes.py):**
```typescript
interface Channel {
  id: string;               // MongoDB ObjectId as string
  user_id: string;
  name: string;
  platform: 'youtube' | 'instagram' | 'facebook' | 'tiktok' | 'linkedin';
  niche?: string;
  posting_frequency: 'daily' | '3x_week' | 'weekly';
  auto_post: boolean;
  review_window_minutes: number;  // default 60
  created_at: string;
  updated_at: string;
}
```

**Providers shape (from model_config_routes.py):**
```typescript
interface Providers {
  script_models: string[];      // ["claude-sonnet-4-6", "gemini-2.0-flash", "gpt-4o"]
  voice_providers: string[];    // ["elevenlabs", "openai_tts", "playht"]
  video_bg_providers: string[]; // ["dalle3", "fal_kling", "runway_gen3"]
  research_providers: string[]; // ["brave", "perplexity", "serper"]
}
```

### Anti-Patterns to Avoid

- **Don't add react-router:** Dashboard uses activeTab state, not a router. Adding a router would require a full refactor of Dashboard.tsx. New tabs are just more state cases.
- **Don't add a form library:** The forms in PipelineBuilder are 4-5 fields. useState is sufficient. Adding react-hook-form or Zod for this would be over-engineering.
- **Don't duplicate icon SVGs:** All platform icons (YouTube, Instagram, Facebook, TikTok) are already defined inline in Dashboard.tsx and SocialIntegration.tsx. Copy them into ChannelDashboard.tsx or extract to a shared constants file — do not add a new icon library.
- **Don't use conditional rendering for tab content:** Use `display: block/none` (same as VideoStudio tab) to preserve component state. `{activeTab === 'channels' && <ChannelDashboard />}` will remount on every tab switch.
- **Don't call /model-config without channel_id:** The hook falls back to user-level default if channel_id is null. For PipelineBuilder, always pass the specific channelId so changes are scoped to that channel.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth tokens for API calls | Custom token fetch | `getAuthHeaders()` from utils/getAuthToken.ts | Already handles Clerk token + header format |
| Provider list fetching | Custom fetch + state | `useModelConfig(channelId).providers` | Hook already fetches /model-config/providers, handles loading/error |
| Config save | Direct fetch to /model-config | `useModelConfig.updateConfig()` | Handles auth, updates local state after save |
| Animation enter/exit | CSS keyframe animations | `framer-motion` AnimatePresence + motion.div | Already a dep, consistent with rest of app |
| Platform icons | Custom SVG set | Copy inline SVGs from Dashboard.tsx | Already defined in the codebase, consistent style |
| Dark theme tokens | Inline hex values | Tailwind classes (e.g., `bg-dark-bg`, `text-dark-text`) | Tailwind config in tailwind.config.js already maps all dark theme tokens |

**Key insight:** The design system, auth plumbing, and model config API layer are all already built. Phase 07 is wiring new components that consume existing infrastructure.

---

## Common Pitfalls

### Pitfall 1: Nav Icon Missing from Import
**What goes wrong:** Adding a new nav entry to Dashboard.tsx without importing the icon from lucide-react causes a runtime error.
**Why it happens:** The nav items array uses icon component references, not string names.
**How to avoid:** Add the icon to the import block at the top of Dashboard.tsx before adding the nav entry. `Workflow` is already imported (visible in the import block at line 32: `import { ..., Workflow } from 'lucide-react'`). Use it for the Channels nav item.
**Warning signs:** TypeScript error "Cannot find name 'Workflow'" or blank icon in sidebar.

### Pitfall 2: Channel API List Returns Array Not Object
**What goes wrong:** GET /channels/ returns a raw JSON array `[{...}, {...}]`, not `{ channels: [...] }`.
**Why it happens:** channel_routes.py line 75-76 returns `[_to_doc(d) for d in docs]` — a plain list.
**How to avoid:** `const channels = await res.json()` — assign directly, don't destructure as `{ channels }`.
**Warning signs:** `channels.map is not a function` or `undefined` channel list.

### Pitfall 3: Stale Providers on Channel Switch
**What goes wrong:** PipelineBuilder shows stale model config when switching between channels because useModelConfig's useEffect only runs on channelId change, but if channelId goes undefined briefly, the hook fetches user-level config.
**Why it happens:** The hook's useEffect dep is `[channelId]` — if the parent passes undefined before setting the real ID, two fetches race.
**How to avoid:** Gate PipelineBuilder rendering: only mount it when `channelId` is a non-empty string. In Dashboard.tsx: `{activePipelineChannel && <PipelineBuilder channelId={activePipelineChannel} />}`.
**Warning signs:** PipelineBuilder shows wrong model config after switching channels.

### Pitfall 4: Platform Values Are Lowercase
**What goes wrong:** Creating a channel with `platform: 'YouTube'` (title case) returns a 422 from the backend.
**Why it happens:** channel_routes.py validates `body.platform not in PLATFORMS` where `PLATFORMS = {"youtube", "instagram", "facebook", "tiktok", "linkedin"}` — all lowercase.
**How to avoid:** In the ChannelDashboard create form, always send lowercase platform values. Use a type-safe constant: `const PLATFORMS = ['youtube', 'instagram', 'facebook', 'tiktok', 'linkedin'] as const`.
**Warning signs:** 422 Unprocessable Entity on POST /channels/.

### Pitfall 5: Model Config POST vs PUT Confusion
**What goes wrong:** Attempting PUT /model-config/{id} returns 404. The route only accepts POST /.
**Why it happens:** model_config_routes.py uses upsert logic on POST / — there is no PUT route.
**How to avoid:** Always use `updateConfig()` from the useModelConfig hook which calls POST /model-config. Never call PUT on model-config endpoints.
**Warning signs:** 405 Method Not Allowed or 404 on model-config updates.

### Pitfall 6: Tailwind Classes Purged in Production
**What goes wrong:** Dynamic Tailwind classes assembled with string interpolation (e.g., `bg-${color}-500`) are purged at build time and don't appear in production.
**Why it happens:** Tailwind's content scanner only captures statically detectable class names.
**How to avoid:** Use complete class name strings in all conditionals. Use the `optCard` pattern from VideoStudioConfigPopup (full class names in ternary, never template literals with variable color segments).
**Warning signs:** Styles work in `npm run dev` but are missing after `npm run build`.

---

## Code Examples

Verified patterns from codebase audit:

### ChannelDashboard — Fetch and Display Channels
```typescript
// Pattern: same as SocialIntegration.tsx fetchIntegrations pattern
import { useState, useEffect } from 'react';
import { getAuthHeaders } from '../../utils/getAuthToken';
import { API_BASE_URL } from '../../config/api';

interface Channel {
  id: string;
  name: string;
  platform: string;
  niche?: string;
  posting_frequency: string;
  auto_post: boolean;
}

export default function ChannelDashboard({ onOpenPipeline }: { onOpenPipeline: (id: string) => void }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`${API_BASE_URL}/channels/`, { headers });
        // IMPORTANT: returns raw array, not { channels: [...] }
        const data: Channel[] = await res.json();
        setChannels(data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ...
}
```

### ModelPicker — Display Providers as Selectable Cards
```typescript
// Pattern from VideoStudioConfigPopup.tsx optCard pattern
import { useModelConfig } from '../../hooks/useModelConfig';

interface ModelPickerProps {
  channelId?: string;
  field: 'script_model' | 'voice_provider' | 'video_bg_provider';
  value: string;
  onChange: (v: string) => void;
}

export function ModelPicker({ channelId, field, value, onChange }: ModelPickerProps) {
  const { providers, loading } = useModelConfig(channelId);

  const options = providers ? providers[field === 'script_model' ? 'script_models'
    : field === 'voice_provider' ? 'voice_providers'
    : 'video_bg_providers'] : [];

  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`rounded-xl border transition-all px-3 py-2 text-sm ${
            value === opt
              ? 'border-teal-500/40 bg-teal-500/[0.08] text-teal-300'
              : 'border-white/[0.07] bg-white/[0.02] text-dark-text-muted hover:border-white/[0.14]'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
```

### PipelineBuilder — Save Config
```typescript
// Uses useModelConfig.updateConfig (already handles auth + state update)
import { useModelConfig } from '../../hooks/useModelConfig';

export default function PipelineBuilder({ channelId }: { channelId: string }) {
  const { providers, config, updateConfig, loading } = useModelConfig(channelId);
  const [scriptModel, setScriptModel] = useState('');
  const [voiceProvider, setVoiceProvider] = useState('');
  const [videoBgProvider, setVideoBgProvider] = useState('');

  // Sync form from loaded config
  useEffect(() => {
    if (config) {
      setScriptModel(config.script_model ?? '');
      setVoiceProvider(config.voice_provider ?? '');
      setVideoBgProvider(config.video_bg_provider ?? '');
    }
  }, [config]);

  const handleSave = async () => {
    await updateConfig({
      channel_id: channelId,
      script_model: scriptModel,
      voice_provider: voiceProvider,
      video_bg_provider: videoBgProvider,
    });
  };

  // ...
}
```

### Framer Motion Enter Animation (consistent with rest of app)
```typescript
// Pattern from SocialIntegration.tsx and VideoStudioConfigPopup.tsx
import { motion, AnimatePresence } from 'framer-motion';

<motion.div
  initial={{ opacity: 0, y: 12 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -8 }}
  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
>
  {/* content */}
</motion.div>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Auth0 (dead code) | Clerk JWT via useAuth() / getAuthHeaders() | Phase 02 | All new components use Clerk only — never import @auth0/auth0-react |
| Supabase auth (useSupabase.ts) | Clerk | Phase 02 | useSupabase.ts is dead code — never use it in new components |
| VideoStudio2.tsx (legacy A/B) | VideoStudio.tsx | Architecture.md tech debt | VideoStudio.tsx is the active component. VideoStudio2.tsx is dead — ignore it |
| No channel concept in UI | channels tab (this phase) | Phase 07 | ChannelDashboard is a net-new surface; no existing component to modify |

**Deprecated/outdated:**
- `useSupabase.ts`: Dead code. Only import from `@clerk/clerk-react`.
- `VideoStudio2.tsx`: Dead code. Only `VideoStudio.tsx` is wired into Dashboard.
- `Auth.tsx` / `AuthCallback.tsx`: Likely redundant with Clerk hosted auth — do not extend.

---

## Open Questions

1. **Navigation placement for Channels and Pipeline tabs**
   - What we know: Dashboard nav has 6 items (dashboard, leads, company-analysis, video-studio, seedance-studio, profile). Channels and Pipeline would add 2 more.
   - What's unclear: Whether Pipeline should be a modal/drawer over ChannelDashboard or a separate tab. Separate tab is simpler; modal avoids adding another nav item.
   - Recommendation: Make PipelineBuilder a sliding panel/modal that opens from ChannelDashboard rather than a separate nav tab. Reduces sidebar clutter. ChannelDashboard gets one nav entry; clicking "Configure Pipeline" on a channel card opens PipelineBuilder as a fullscreen overlay (AnimatePresence pattern already in the app).

2. **Video status / Celery progress display in channel dashboard**
   - What we know: Phase 05 added Redis-backed progress at `GET /content/video-remotion/progress/{job_id}`. Phase 07's goal is channel monitoring without developer access.
   - What's unclear: Whether UI-01 requires showing live render progress per channel or just channel metadata (platform/niche/frequency).
   - Recommendation: Phase 07 scope is channel metadata only (platform, niche, frequency, auto-post toggle). Live render progress polling is Phase 08 (scheduling + analytics). Don't expand scope into async job monitoring here.

3. **Channel creation flow — wizard or inline form**
   - What we know: Channel creation requires: name, platform (from 5 options), niche (text), posting_frequency (3 options), auto_post (bool), review_window_minutes (int). That's 6 fields.
   - What's unclear: Whether the create flow should be a modal or inline form.
   - Recommendation: Modal using the same AnimatePresence fullscreen overlay pattern from VideoStudioConfigPopup.tsx. Consistent with existing UI. Single-step form (no wizard needed — 6 fields is simple).

---

## Sources

### Primary (HIGH confidence — codebase audit, all file:line verified)
- `/tmp/sf-prod/backend/app/routes/channel_routes.py` — complete channel CRUD API, all field names and validations verified
- `/tmp/sf-prod/backend/app/routes/model_config_routes.py` — all provider constants, upsert logic, route structure verified
- `/tmp/sf-prod/frontend/src/hooks/useModelConfig.ts` — full hook implementation read, API calls verified
- `/tmp/sf-prod/frontend/src/components/Dashboard.tsx:802-819` — nav item pattern verified
- `/tmp/sf-prod/frontend/src/components/Dashboard.tsx:997-1028` — tab render pattern verified
- `/tmp/sf-prod/frontend/src/components/videostudio/VideoStudioConfigPopup.tsx:68-75` — optCard glass pattern verified
- `/tmp/sf-prod/frontend/tailwind.config.js` — all design tokens verified (colors, fonts, shadows, animations)
- `/tmp/sf-prod/frontend/src/styles/index.css` — CSS custom properties, global dark theme verified
- `/tmp/sf-prod/frontend/package.json` — all current dependency versions verified
- `/tmp/sf-prod/.planning/PROJECT.md` — requirement IDs UI-01/UI-02/UI-03 and P7-UI verified

### Secondary (MEDIUM confidence)
- `/tmp/sf-prod/.planning/STATE.md` — architecture decisions (Clerk active, Auth0 dead, useSupabase dead), confirmed via code audit
- `/tmp/sf-prod/ARCHITECTURE.md` — component inventory and tech debt list (VideoStudio2 dead, Auth0 dead) cross-referenced with actual code

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies verified in package.json, no guessing
- Architecture: HIGH — all patterns verified by reading actual component code
- Pitfalls: HIGH — all pitfalls derived from reading actual backend validation code and frontend patterns, not from generic React knowledge
- API contract: HIGH — all field names verified against channel_routes.py and model_config_routes.py source

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (stable codebase — no active churn on these files expected)
