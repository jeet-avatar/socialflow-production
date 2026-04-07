/**
 * Converts a 6-digit hex color string to its HSL hue (0–360).
 * Needed because ParticleField and PulseRings accept `hue: number`, not hex.
 */
export function hexToHue(hex: string): number {
  const cleaned = hex.replace('#', '');
  if (cleaned.length !== 6) return 220;
  const r = parseInt(cleaned.slice(0, 2), 16) / 255;
  const g = parseInt(cleaned.slice(2, 4), 16) / 255;
  const b = parseInt(cleaned.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return Math.round(h * 60);
}
