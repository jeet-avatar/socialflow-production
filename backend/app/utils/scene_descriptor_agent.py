"""
Video Director Agent — Template Picker System
GPT-4o-mini picks from 10 expert-designed Remotion templates.
GPT's job: group segments, pick template, write headline + subtext, choose accent color.
Visual design is handled entirely by the pre-built templates — GPT cannot break it.
"""

import json
import logging
import os
import re
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger(__name__)

VALID_TEMPLATES = {
    "CinematicReveal", "StatShot", "SplitStage", "WordBurst", "NeonFrame",
    "TimelineStep", "IconHero", "WaveText", "QuoteReveal", "CTABurst",
    "GlitchReveal", "ZoomPunch", "HorizontalSlam", "DataStream", "CinematicBars",
    "ChromaSlice", "ElectricPulse", "SplitReveal", "TypeBurn", "GravityDrop",
}
VALID_TRANSITIONS = {"cross_fade", "flash", "zoom_out", "none"}
VALID_ICONS = {
    "person", "controller", "ai_brain", "trophy", "handshake", "star",
    "rocket", "chart", "shield", "eye", "lightning", "globe", "none",
}
HEX_RE = re.compile(r'^#[0-9A-Fa-f]{6}$')


SYSTEM_PROMPT = """You are an award-winning motion graphics director creating high-energy B2B pitch videos. Your job: slice the script into MANY short punchy scenes and assign killer templates + 2–4 word power headlines.

═══════════════════════════════════════════════════════════
TEMPLATES — 15 available, each with a distinct visual DNA:
═══════════════════════════════════════════════════════════

  ── CINEMATIC / PREMIUM ──
  CinematicReveal  → Thin neon line sweeps in, headline slides up below it. BEST FOR: speaker/brand intro, opening hook, key statements.
  CinematicBars    → Letterbox black bars slide in (cinematic 2.35:1), headline letter-spacing expands. BEST FOR: premium brand moments, editorial statements.
  QuoteReveal      → Giant translucent quote mark, italic text, accent left bar. BEST FOR: testimonials, bold claims, insight reveals.

  ── KINETIC / HIGH-ENERGY ──
  ZoomPunch        → Headline zooms from 350% → 100% with blur-to-sharp, impact glow pulse. BEST FOR: single power word, achievement, stat that hits hard.
  HorizontalSlam   → Neon slabs slam from both sides, headline springs from center. BEST FOR: partnership reveals, "X meets Y" moments, bold propositions.
  WordBurst        → Single massive word fills entire screen. Pure impact. BEST FOR: one word that defines the moment — "IMPOSSIBLE", "NOW", "FASTER".
  CTABurst         → Staggered arrows burst left + bold CTA headline + scanlines. BEST FOR: call to action, closing ask, booking a meeting.
  GravityDrop      → Words fall from above with spring bounce + squish on landing. BEST FOR: feature lists, benefit stacking, multi-word reveals.
  ElectricPulse    → Radial rays burst from centre, concentric rings pulse outward, headline materialises from glow. BEST FOR: AI reveals, tech capabilities, explosive statements.
  SplitReveal      → Frame cracks open — top/bottom panels slide apart, content revealed in the glowing gap. BEST FOR: duality, "before/after", contrast moments.

  ── TECH / DATA ──
  GlitchReveal     → RGB channel split glitches for 15 frames then snaps clean. BEST FOR: AI/data reveals, disruption moments, tech breakthroughs.
  DataStream       → Matrix falling data chars + neon scan line sweeps revealing headline. BEST FOR: data engineering, analytics, AI capabilities.
  TypeBurn         → Characters burn in one-by-one with glowing flare, blinking cursor. BEST FOR: hacker energy, key facts, code/data moments.
  StatShot         → Giant number counts up + pulsing rings + radial glow. BEST FOR: ANY number, metric, percentage, growth figure.

  ── STRUCTURED / CLEAR ──
  ChromaSlice      → Diagonal accent slash slices across frame, headline punches in to the right. BEST FOR: partnership reveals, brand × brand moments.
  SplitStage       → Left dark panel (icon) | vertical line | right headline. BEST FOR: feature intro, product + icon combo.
  NeonFrame        → Glowing corner L-brackets + centered headline. BEST FOR: corporate trust, established brand, credibility.
  TimelineStep     → Ghost step number background + rule + headline. BEST FOR: process steps, how-it-works, numbered sequences.
  IconHero         → Large icon + orbital ring + headline below. BEST FOR: AI capability, feature highlight, product icon.
  WaveText         → Words reveal one-by-one, alternating white + accent. BEST FOR: value propositions, emotional beats, collaborative moments.

═══════════════════════════════════════════════════
ICONS (SplitStage / IconHero only):
  person, controller, ai_brain, trophy, handshake, star, rocket, chart, shield, eye, lightning, globe
═══════════════════════════════════════════════════

═══════════════════════════════════════════════════
ACCENT COLORS — mix boldly, never repeat:
  Electric Blue  #4f9eff   → trust, enterprise, SaaS
  Royal Purple   #8b5cf6   → gaming, creative, premium
  Neon Cyan      #00d4ff   → AI, innovation, data
  Plasma Purple  #a855f7   → energy, premium, bold
  Acid Green     #00ff88   → success, CTA, growth
  Gold           #f5a623   → achievement, prestige, awards
  Hot Orange     #ff6b35   → urgency, energy, startup
  Teal           #06b6d4   → analytics, health, clarity
  Rose           #f43f5e   → emotion, urgency, human
═══════════════════════════════════════════════════

═══════════════════════════════════════════════════
OUTPUT — return ONLY valid JSON:
═══════════════════════════════════════════════════
{
  "concept": "One punchy sentence describing this video's energy",
  "style": {
    "mood": "cinematic | high-energy | minimal | corporate | emotional | bold",
    "motion_style": "energetic | smooth | cinematic | minimal"
  },
  "scenes": [
    {
      "segment_indices": [0],
      "template": "CinematicBars",
      "headline": "UBISOFT MEETS APPLE",
      "subtext": "A Strategic Opportunity",
      "accent_color": "#8b5cf6",
      "icon": "none",
      "transition_out": "flash",
      "description": "Cinematic opener — company + prospect name drop"
    }
  ]
}

═══════════════════════════════════════════════════
GROUPING RULES — SHORT SCENES = MORE ENERGY:
═══════════════════════════════════════════════════
- Use exactly 1 Whisper segment per scene — never group multiple segments together
- Target scene duration: 2–5 seconds each (HARD MAX: 5 seconds — clips are generated at exactly 5s)
- Create exactly as many scenes as there are segments — 1 scene per segment, no more, no less
- All segment indices 0 to N must appear in EXACTLY ONE scene

═══════════════════════════════════════════════════
HEADLINE WRITING — THE MOST IMPORTANT PART:
═══════════════════════════════════════════════════
- 2–4 WORDS MAXIMUM. Short = powerful. Long headlines = weak.
- ALL CAPS always.
- Extract the CORE IDEA of each scene, not the full text.
- Think like a magazine cover. Punch. Impact. Memorability.
- Examples:
  Script: "At Ubisoft India Studios, we see Apple's recent funding boost as the perfect time..."
  → "UBISOFT × APPLE"  (NOT "AT UBISOFT INDIA STUDIOS WE SEE APPLE")
  Script: "Our data engineering optimizes experiences akin to Assassin's Creed."
  → "DATA THAT DOMINATES"  (NOT "OUR DATA ENGINEERING OPTIMIZES EXPERIENCES")
  Script: "Let's discuss collaboration."
  → "LET'S BUILD THIS"

═══════════════════════════════════════════════════
NARRATIVE ARC — MANDATORY:
═══════════════════════════════════════════════════
Scene 1:  HOOK — Grab attention in frame 1. Use CinematicBars, ZoomPunch, GlitchReveal, or HorizontalSlam.
Scene 2:  CONTEXT — Who/what/why. Use CinematicReveal or SplitStage.
Middle:   BUILD — One powerful idea per scene. Vary templates aggressively.
          → Use DataStream or GlitchReveal for tech/data moments
          → Use StatShot for ANY numbers
          → Use WordBurst for single-word power moments
          → Use WaveText or HorizontalSlam for collaboration/partnership beats
          → Use ZoomPunch for achievement/capability moments
Last:     CTA — ALWAYS use CTABurst. Subtext = the exact ask ("Book a Discovery Call", "Schedule a Demo").

═══════════════════════════════════════════════════
TRANSITION RULES — BE AGGRESSIVE:
═══════════════════════════════════════════════════
- "flash"    → Use before high-energy scenes (ZoomPunch, WordBurst, GlitchReveal, HorizontalSlam)
- "zoom_out" → Use before calm/premium scenes (CinematicBars, QuoteReveal, CinematicReveal)
- "cross_fade" → Default for mid-energy transitions
- "none"     → Last scene ONLY (mandatory)

CRITICAL RULES:
- NEVER the same template twice in a row
- NEVER the same accent color twice in the whole video
- Use "flash" for at least 40% of transitions (keep energy high)
- The final scene transition_out MUST be "none"
- StatShot for every single number/metric/percentage — no exceptions"""


def build_user_message(dialogue: str, segments: List[Dict[str, Any]], company_name: Optional[str]) -> str:
    context = f"Company/Client: {company_name}\n" if company_name else ""
    segment_list = "\n".join(
        f'  {i}. [{seg["start"]:.1f}s–{seg["end"]:.1f}s]: "{seg["text"].strip()}"'
        for i, seg in enumerate(segments)
    )
    total_dur = segments[-1]["end"] if segments else 0
    return (
        f"{context}"
        f"Full script:\n\"{dialogue}\"\n\n"
        f"Whisper segments ({len(segments)} total, {total_dur:.1f}s):\n{segment_list}\n\n"
        f"Create EXACTLY {len(segments)} scenes (1 segment per scene — no grouping). "
        f"Pick a DIFFERENT template per scene. "
        f"Write 2–4 word POWER headlines (ALL CAPS). "
        f"All segment indices 0–{len(segments)-1} must appear in exactly one scene. "
        f"Use 'flash' for 40%+ of transitions. Last scene transition_out must be 'none'."
    )


def generate_video_concept(
    dialogue: str,
    segments: List[Dict[str, Any]],
    company_name: Optional[str] = None,
    model_name: str = "claude-sonnet-4-6",   # NEW — was hardcoded at line 207
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], str, Dict[str, Any]]:
    """
    Call GPT-4o-mini to pick templates + write headlines for each scene group.

    Returns:
        scene_specs: List[TemplateSceneSpec]
        grouped_segments: List[SubtitleSegment]
        concept: str
        style: dict
    """
    if not segments:
        logger.warning("[VideoDirector] No segments — returning empty")
        return [], [], "", {}

    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        logger.error("[VideoDirector] ANTHROPIC_API_KEY not set — using fallback")
        return _fallback_concept(segments)

    user_message = build_user_message(dialogue, segments, company_name)

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)

        logger.info(f"[VideoDirector] Calling Claude — {len(segments)} segment(s)...")
        response = client.messages.create(
            model=model_name,
            max_tokens=3000,
            system=SYSTEM_PROMPT,
            messages=[
                {"role": "user", "content": user_message + "\n\nRespond with valid JSON only."},
            ],
        )

        raw = response.content[0].text.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()
        logger.info(f"[VideoDirector] Claude response: {raw[:300]}...")

        parsed = json.loads(raw)
        concept = str(parsed.get("concept", ""))
        style = _validate_style(parsed.get("style", {}))
        claude_scenes = parsed.get("scenes", [])

        scene_specs, grouped_segments = _process_scenes(claude_scenes, segments)

        logger.info(f"[VideoDirector] {len(claude_scenes)} scenes → {len(scene_specs)} validated")
        return scene_specs, grouped_segments, concept, style

    except Exception as e:
        logger.error(f"[VideoDirector] Claude call failed: {e} — using fallback")
        return _fallback_concept(segments)


def _process_scenes(
    gpt_scenes: List[dict],
    whisper_segments: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    covered: set = set()
    valid_scenes = []

    for i, scene in enumerate(gpt_scenes):
        indices = scene.get("segment_indices") or []
        try:
            indices = [int(x) for x in indices]
        except (TypeError, ValueError):
            indices = []

        indices = [idx for idx in indices if 0 <= idx < len(whisper_segments) and idx not in covered]
        if not indices:
            continue

        indices.sort()
        covered.update(indices)

        texts = [whisper_segments[idx]["text"].strip() for idx in indices]
        start = whisper_segments[indices[0]]["start"]
        end = whisper_segments[indices[-1]]["end"]
        grouped_seg = {"text": " ".join(texts), "start": start, "end": end}

        spec = _validate_spec(scene, i)
        valid_scenes.append((spec, grouped_seg))

    # Cover any segments GPT missed
    uncovered = sorted(set(range(len(whisper_segments))) - covered)
    if uncovered:
        logger.warning(f"[VideoDirector] {len(uncovered)} uncovered segment(s) — using fallback")
        for idx in uncovered:
            seg_text = whisper_segments[idx].get("text", "")
            spec = _fallback_spec(len(valid_scenes), text=seg_text)
            spec["segment_indices"] = [idx]
            valid_scenes.append((spec, dict(whisper_segments[idx])))

    return [s for s, _ in valid_scenes], [g for _, g in valid_scenes]


def _validate_spec(scene: dict, index: int) -> dict:
    template = scene.get("template", "")
    if template not in VALID_TEMPLATES:
        template = list(VALID_TEMPLATES)[index % len(VALID_TEMPLATES)]

    accent = scene.get("accent_color", "")
    if not HEX_RE.match(str(accent)):
        accent = ["#4f9eff", "#8b5cf6", "#00d4ff", "#f5a623", "#00ff88"][index % 5]

    t_out = scene.get("transition_out", "cross_fade")
    if t_out not in VALID_TRANSITIONS:
        t_out = "flash"

    icon = scene.get("icon", "none")
    if icon not in VALID_ICONS:
        icon = "none"

    return {
        "segment_index":   index,
        "segment_indices": scene.get("segment_indices", [index]),
        "template":        template,
        "headline":        str(scene.get("headline", ""))[:80].upper(),
        "subtext":         str(scene.get("subtext", ""))[:120],
        "accent_color":    accent,
        "icon":            icon,
        "transition_out":  t_out,
        "description":     str(scene.get("description", ""))[:200],
    }


def _validate_style(style: Any) -> dict:
    VALID_MOODS = {"cinematic", "high-energy", "minimal", "corporate", "emotional", "bold"}
    VALID_MOTION = {"energetic", "smooth", "cinematic", "minimal"}
    if not isinstance(style, dict):
        style = {}
    return {
        "mood": style.get("mood") if style.get("mood") in VALID_MOODS else "cinematic",
        "motion_style": style.get("motion_style") if style.get("motion_style") in VALID_MOTION else "smooth",
    }


def _headline_from_text(text: str, max_words: int = 5) -> str:
    """Extract a short headline from segment text (first few key words, uppercased)."""
    # Strip punctuation and take first max_words words
    import string
    words = text.strip().split()
    # Skip common filler words at the start
    skip = {"the", "a", "an", "and", "or", "but", "so", "we", "our", "your", "you", "it", "is", "are", "was", "were"}
    key_words = [w.strip(string.punctuation) for w in words if w.strip(string.punctuation).lower() not in skip][:max_words]
    if not key_words:
        key_words = words[:max_words]
    return " ".join(key_words).upper()[:60]


# Ordered fallback template sequence: Hook → Build → Payoff
_FALLBACK_SEQUENCE = [
    "CinematicBars", "ElectricPulse", "GlitchReveal", "ChromaSlice",
    "DataStream", "HorizontalSlam", "SplitReveal", "WaveText",
    "ZoomPunch", "TypeBurn", "NeonFrame", "GravityDrop",
    "SplitStage", "IconHero", "StatShot", "QuoteReveal", "WordBurst", "CTABurst",
]
_FALLBACK_COLORS = ["#8b5cf6", "#00d4ff", "#f5a623", "#00ff88", "#ff6b35", "#4f9eff", "#a855f7", "#f43f5e", "#06b6d4"]


def _fallback_concept(
    segments: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], str, Dict[str, Any]]:
    n = len(segments)
    specs = []
    for i, seg in enumerate(segments):
        # Last scene always gets CTABurst
        template = "CTABurst" if i == n - 1 and n > 1 else _FALLBACK_SEQUENCE[i % (len(_FALLBACK_SEQUENCE) - 1)]
        headline = _headline_from_text(seg.get("text", ""), max_words=4)
        # Use flash for ~50% of transitions, zoom_out for premium scenes, none for last
        HIGH_ENERGY = {"ZoomPunch", "WordBurst", "GlitchReveal", "HorizontalSlam", "CTABurst"}
        if i == n - 1:
            transition_out = "none"
        elif template in HIGH_ENERGY or i % 2 == 0:
            transition_out = "flash"
        else:
            transition_out = "zoom_out"
        specs.append({
            "segment_index":   i,
            "segment_indices": [i],
            "template":        template,
            "headline":        headline,
            "subtext":         "",
            "accent_color":    _FALLBACK_COLORS[i % len(_FALLBACK_COLORS)],
            "icon":            "none",
            "transition_out":  transition_out,
            "description":     f"Auto-generated scene {i + 1}",
        })
    return specs, [dict(s) for s in segments], "Auto-generated video", {"mood": "cinematic", "motion_style": "smooth"}


def _fallback_spec(index: int, text: str = "") -> dict:
    return {
        "segment_index":   index,
        "segment_indices": [index],
        "template":        _FALLBACK_SEQUENCE[index % len(_FALLBACK_SEQUENCE)],
        "headline":        _headline_from_text(text, max_words=4) if text else f"SCENE {index + 1}",
        "subtext":         "",
        "accent_color":    _FALLBACK_COLORS[index % len(_FALLBACK_COLORS)],
        "icon":            "none",
        "transition_out":  "cross_fade",
        "description":     "",
    }
