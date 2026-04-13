"""
Seedance Studio Service — generates Higgsfield Seedance 2.0 prompts via Claude.
Supports 15 video styles, each with style-specific guidance injected into the prompt.
"""

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Style catalogue
# ---------------------------------------------------------------------------

STYLES: dict[str, dict] = {
    "cinematic": {
        "name": "Cinematic",
        "emoji": "🎬",
        "description": "Hollywood film quality — dramatic lighting, lens language, depth of field",
        "tags": ["film", "dramatic", "Hollywood", "noir", "epic"],
        "guide": (
            "STYLE: Cinematic Film\n"
            "Camera: dolly push-ins, crane shots, whip pans, rack focus, Steadicam follow\n"
            "Lighting: three-point, motivated sources, lens flares, fog/haze, golden hour\n"
            "Color: desaturated with LUT grading (teal+orange, noir blue, warm amber)\n"
            "Hook: black screen → light burst | extreme close-up → wide reveal | eyes opening\n"
            "Pacing: measured and intentional — every frame carries weight"
        ),
    },
    "3d-cgi": {
        "name": "3D CGI",
        "emoji": "🖥️",
        "description": "3D rendered — Pixar, Unreal Engine, photorealistic, isometric",
        "tags": ["3D", "CGI", "Pixar", "render", "Unreal"],
        "guide": (
            "STYLE: 3D CGI / Rendered\n"
            "Camera: orbital spins, impossible camera angles, physics-defying moves\n"
            "Lighting: HDRI environment, subsurface scattering, global illumination\n"
            "Texture: specify render engine feel — Pixar painterly, Unreal photorealistic, or flat isometric\n"
            "Hook: logo emerging from particles | product materializing | impossible geometry reveal\n"
            "Note: describe surface materials explicitly (matte plastic, brushed metal, glass)"
        ),
    },
    "cartoon": {
        "name": "Cartoon",
        "emoji": "🎨",
        "description": "2D animation — cel-shaded, hand-drawn, flat vector, watercolor",
        "tags": ["2D", "animation", "cartoon", "cel-shaded", "anime"],
        "guide": (
            "STYLE: 2D Cartoon Animation\n"
            "Specify sub-style: cel-shaded (thick outlines, flat color), watercolor (soft edges, texture), "
            "flat vector (clean geometric), hand-drawn (pencil texture, imperfect lines)\n"
            "Motion: squash-and-stretch, anticipation frames, exaggerated timing\n"
            "Hook: character pops into frame | panel wipe reveal | ink splash transition\n"
            "Color: bold palette, limited to 4-6 colors per scene"
        ),
    },
    "comic-to-video": {
        "name": "Comic to Video",
        "emoji": "💥",
        "description": "Animate comics — manga, webtoons, storyboards, sequential art",
        "tags": ["comic", "manga", "webtoon", "motion comic"],
        "guide": (
            "STYLE: Motion Comic / Animated Panel\n"
            "Panel transitions: zoom into panel, parallax shift between layers, page-turn wipe\n"
            "Motion: foreground elements animate while background stays static (parallax)\n"
            "Speed lines, impact frames, onomatopoeia text appearing on-screen\n"
            "Hook: dramatic panel slam reveal | speed lines exploding outward | ink splash\n"
            "Sound: punchy SFX synced to action frames"
        ),
    },
    "fight-scenes": {
        "name": "Fight Scenes",
        "emoji": "⚔️",
        "description": "Action choreography — martial arts, fantasy combat, superhero",
        "tags": ["action", "fight", "martial arts", "combat", "superhero"],
        "guide": (
            "STYLE: Action / Fight Choreography\n"
            "Camera: low Dutch angle for power, high-speed pan to track strikes, slow-mo impact frames\n"
            "Timing: fast cuts on impact (0.2-0.5s beats), slow-mo at peak action, speed ramp\n"
            "VFX: motion blur on fast strikes, particle impacts, energy trails\n"
            "Hook: fist flying into frame | slow-mo eye contact before clash | weapon unsheathed\n"
            "Sound: bone crack, cloth whoosh, foley hits must be specified"
        ),
    },
    "motion-design-ad": {
        "name": "Motion Design Ad",
        "emoji": "📐",
        "description": "Motion graphics for ads — kinetic typography, brand animation",
        "tags": ["motion design", "ad", "typography", "brand", "commercial"],
        "guide": (
            "STYLE: Motion Design / Brand Ad\n"
            "Typography: kinetic text appearing with spring, bounce, or wipe animations\n"
            "Geometry: clean shapes morphing, grid systems, modular design language\n"
            "Timing: music-synced cuts, beat drops match visual transitions\n"
            "Hook: logo morph reveal | text assembling from particles | geometric burst\n"
            "Output format: specify aspect ratio (16:9 for YouTube, 9:16 for TikTok/Reels, 1:1 for feed)"
        ),
    },
    "ecommerce-ad": {
        "name": "Ecommerce Ad",
        "emoji": "🛍️",
        "description": "Product showcase ads — hero shots, lifestyle, unboxing",
        "tags": ["product", "ecommerce", "ad", "lifestyle", "commercial"],
        "guide": (
            "STYLE: Ecommerce Product Ad\n"
            "Shot types: hero 360 product spin, lifestyle context shot, close-up texture/material, unboxing\n"
            "Lighting: clean studio (white/gradient BG) OR aspirational lifestyle lighting\n"
            "CTA integration: text overlay timing — value prop at 3s, CTA at final 2s\n"
            "Hook: product flying into clean frame | before/after split | lifestyle aspiration shot\n"
            "Platform: optimize for feed stop-scroll — bright colors, high contrast in first frame"
        ),
    },
    "anime-action": {
        "name": "Anime Action",
        "emoji": "⚡",
        "description": "Anime-style video — shonen battles, sakura petals, speed lines",
        "tags": ["anime", "manga", "Japanese animation", "shonen", "action"],
        "guide": (
            "STYLE: Anime / Japanese Animation\n"
            "Visual language: speed lines (hōsoku), impact frames (sakuga cuts), dramatic wind/hair\n"
            "Camera: low angle for power shots, extreme close-up eyes, dramatic sky reveals\n"
            "Timing: held tension frames, sudden explosive movement, freeze-frame impact\n"
            "Hook: eyes opening with energy glow | wind-swept dramatic pose | energy charging aura\n"
            "Color: saturated with bloom highlights, cherry blossom particles, energy auras"
        ),
    },
    "product-360": {
        "name": "Product 360°",
        "emoji": "🔄",
        "description": "360° product showcase — orbital camera, studio lighting",
        "tags": ["product", "360", "studio", "showcase", "commercial"],
        "guide": (
            "STYLE: 360° Product Showcase\n"
            "Camera: smooth orbital rotation (270° over 4-6s), top-down reveal, close-up detail cuts\n"
            "Lighting: three-point studio OR rim-lit dramatic dark background\n"
            "Transitions: material zoom-in, reflection reveal, color variant morph\n"
            "Hook: product emerging from black | spotlight snap-on | floating/levitating reveal\n"
            "Detail shots: specify key product features to highlight with timing"
        ),
    },
    "music-video": {
        "name": "Music Video",
        "emoji": "🎵",
        "description": "Music video aesthetics — beat-synced cuts, performance, visual metaphor",
        "tags": ["music", "performance", "beat-sync", "artistic"],
        "guide": (
            "STYLE: Music Video\n"
            "Beat sync: cuts MUST align with beat drops, specify BPM or describe tempo\n"
            "Camera: handheld performance energy, strobing effects, double exposure\n"
            "Aesthetics: lo-fi grain + neon, VHS retro, clean contemporary, or abstract visual metaphor\n"
            "Hook: beat drop visual sync | performer enter frame dramatically | abstract rhythm pattern\n"
            "Movement: camera always in motion — never static for more than 1.5s"
        ),
    },
    "social-hook": {
        "name": "Social Hook",
        "emoji": "📱",
        "description": "Short-form social content — TikTok, Reels, Shorts stop-scroll hooks",
        "tags": ["TikTok", "Reels", "Shorts", "viral", "social media"],
        "guide": (
            "STYLE: Short-Form Social Hook (9:16 vertical)\n"
            "Format: 9:16 vertical, safe zone 1080×1350 center\n"
            "Hook: must trigger stop-scroll in 0-2s — pattern interrupt, curiosity gap, or shock\n"
            "Pacing: fast cuts (1.5-2.5s per shot), no dead air, constant visual movement\n"
            "Text: captions appear with pop animation, high contrast for silent viewing\n"
            "Platform: TikTok (fast+punchy), Reels (aesthetic+aspirational), Shorts (informative+clear)"
        ),
    },
    "brand-story": {
        "name": "Brand Story",
        "emoji": "🏆",
        "description": "Brand narrative — emotional storytelling, mission, values",
        "tags": ["brand", "story", "emotional", "corporate", "narrative"],
        "guide": (
            "STYLE: Brand Story / Corporate Narrative\n"
            "Tone: authentic, emotionally resonant, aspirational but grounded\n"
            "Camera: documentary-style handheld for authenticity, beauty shots for polish\n"
            "Pacing: slower, purposeful — let emotion breathe (3-5s shots)\n"
            "Hook: intimate human moment | founder/product origin reveal | before/after transformation\n"
            "Sound: emotional score bed + natural ambient sound, not overpowering"
        ),
    },
    "fashion-lookbook": {
        "name": "Fashion Lookbook",
        "emoji": "👗",
        "description": "Fashion & lookbook — editorial, runway, lifestyle styling",
        "tags": ["fashion", "lookbook", "editorial", "style", "clothing"],
        "guide": (
            "STYLE: Fashion / Editorial Lookbook\n"
            "Camera: slow tracking shots, editorial close-ups on fabric texture, model movement\n"
            "Lighting: high-key studio OR dramatic single-source, golden hour lifestyle\n"
            "Motion: fabric in motion (wind, spin, walk), hair movement, textile texture reveals\n"
            "Hook: fabric swish into frame | editorial crop reveal | transformation/outfit change\n"
            "Color: specify palette — clean neutrals, bold color block, or tonal monochrome"
        ),
    },
    "food-beverage": {
        "name": "Food & Beverage",
        "emoji": "🍽️",
        "description": "Food & drink video — hero shots, process, appetite appeal",
        "tags": ["food", "beverage", "restaurant", "recipe", "ASMR"],
        "guide": (
            "STYLE: Food & Beverage\n"
            "Shot types: hero overhead, side profile, steam/pour close-up, hand-plating action\n"
            "Lighting: warm and appetizing — avoid cool light, use diffused key + warm fill\n"
            "Macro: extreme close-up of texture, drip, foam, steam\n"
            "Hook: sauce pour in slow-mo | steam rising from perfect dish | dramatic cheese pull\n"
            "Sound: ASMR sizzle, pour, crunch — specify which sounds for each moment"
        ),
    },
    "real-estate": {
        "name": "Real Estate",
        "emoji": "🏠",
        "description": "Real estate walkthroughs — property reveal, architecture, lifestyle",
        "tags": ["real estate", "property", "architecture", "walkthrough"],
        "guide": (
            "STYLE: Real Estate / Architecture\n"
            "Camera: smooth dolly forward through doorways, reveal shots, window-to-exterior\n"
            "Lighting: golden hour exterior, bright clean interior (practical lights ON)\n"
            "Movement: always moving forward — into rooms, toward windows, up staircases\n"
            "Hook: gate/door opening reveal | aerial descent to property | window reveal of view\n"
            "Sequence: exterior approach → entry → key rooms → hero feature → lifestyle moment"
        ),
    },
}

# ---------------------------------------------------------------------------
# Universal system prompt (injected per call with style_guide)
# ---------------------------------------------------------------------------

_BASE_SYSTEM = """You are a world-class AI video prompt engineer for Seedance 2.0 on Higgsfield.
Transform the user's creative concept into a single large, detailed, paste-ready prompt.

SEEDANCE 2.0 CAPABILITIES:
- Input: up to 9 images (@image1…@image9), 3 videos (@video1…), 3 audio files (@audio1…)
- Output: 4–15 seconds of 720p video with synchronized sound
- Reference syntax: use @material[name] for uploaded assets

MANDATORY PROMPT STRUCTURE:
1. HOOK (0–2s): Describe the attention-grabbing opening — must stop the scroll instantly
2. MAIN ACTION (2s to end): Beat-by-beat with exact timecodes (e.g., "2–8s:", "8–15s:")
3. CAMERA: Specify movement, angle, and technique (not just "zoom" — be precise)
4. LIGHTING: Describe setup, color temperature, motivated sources
5. SOUND DESIGN: Ambient bed, specific SFX, music style/feel, silence moments
6. PLATFORM NOTE (1 line): Optimization for the specified platform

RULES:
- Output ONLY the prompt text — no explanations, headers, or commentary
- Minimum 18 lines of dense, specific prompt content
- Every second must be accounted for with timecode
- Be hyper-specific: not "dramatic lighting" but "single key light from frame-left, 3200K warm, casting sharp shadow across face"
- If channel name or brand is provided, weave it naturally into appropriate moments

{style_guide}
"""

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_all_styles() -> list[dict]:
    """Return style catalogue for the frontend picker."""
    return [
        {
            "id": sid,
            "name": s["name"],
            "emoji": s["emoji"],
            "description": s["description"],
            "tags": s["tags"],
        }
        for sid, s in STYLES.items()
    ]


def generate_prompt(
    style_id: str,
    concept: str,
    platform: str,
    duration_seconds: int,
    channel_name: Optional[str] = None,
) -> dict:
    """
    Call Claude with the style-specific system prompt to generate a Seedance 2.0 prompt.
    Returns {"prompt": str, "style_name": str, "style_emoji": str}
    """
    if style_id not in STYLES:
        raise ValueError(f"Unknown style: {style_id}")

    style = STYLES[style_id]
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not configured")

    system_prompt = _BASE_SYSTEM.format(style_guide=style["guide"])

    channel_line = f"\nChannel/Brand name: {channel_name}" if channel_name else ""
    user_message = (
        f"Generate a Seedance 2.0 prompt for the following:\n\n"
        f"Style: {style['name']}\n"
        f"Platform: {platform}\n"
        f"Duration: {duration_seconds} seconds\n"
        f"Concept: {concept}"
        f"{channel_line}\n\n"
        f"Write the full prompt now:"
    )

    import anthropic
    client = anthropic.Anthropic(api_key=api_key)

    logger.info(f"[SeedanceService] Generating {style_id} prompt for platform={platform} duration={duration_seconds}s")

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )

    prompt_text = response.content[0].text.strip()
    logger.info(f"[SeedanceService] Generated {len(prompt_text)} chars")

    return {
        "prompt": prompt_text,
        "style_name": style["name"],
        "style_emoji": style["emoji"],
    }
