import { Color } from 'three';
import { clamp, lerp } from './mathx.ts';

/**
 * The room's mood. Every preset drives the sky shader, fog, lights, rug,
 * floating motes and the CSS accent colours of the interface.
 */
export interface PalettePreset {
  id: string;
  label: string;
  emoji: string;
  skyTop: number;
  skyBottom: number;
  skyHorizon: number;
  sunColor: number;
  sunIntensity: number;
  sunElevation: number;
  sunAzimuth: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  rug: number;
  rugRings: number;
  mote: number;
  moteOpacity: number;
  lamp: number;
  ui: { accent: string; accent2: string };
}

export const PRESETS: readonly PalettePreset[] = [
  {
    id: 'dawn',
    label: 'Dawn',
    emoji: '🌅',
    skyTop: 0xa9b8ee,
    skyBottom: 0xffd3bd,
    skyHorizon: 0xffe7d5,
    sunColor: 0xffc39b,
    sunIntensity: 1.5,
    sunElevation: 7,
    sunAzimuth: 62,
    hemiSky: 0xdfe6ff,
    hemiGround: 0xf6d9c4,
    hemiIntensity: 0.78,
    fog: 0xf7ddd2,
    fogNear: 14,
    fogFar: 46,
    rug: 0xf3c8b3,
    rugRings: 0xe0a992,
    mote: 0xfff0dd,
    moteOpacity: 0.5,
    lamp: 0.4,
    ui: { accent: '#ff9d6e', accent2: '#a99cf0' },
  },
  {
    id: 'morning',
    label: 'Morning',
    emoji: '🌤️',
    skyTop: 0xa6d6ff,
    skyBottom: 0xe2f2ff,
    skyHorizon: 0xf7fbff,
    sunColor: 0xfff5d6,
    sunIntensity: 2.35,
    sunElevation: 44,
    sunAzimuth: 122,
    hemiSky: 0xdeefff,
    hemiGround: 0xeaf3d8,
    hemiIntensity: 1.0,
    fog: 0xe8f3ff,
    fogNear: 18,
    fogFar: 58,
    rug: 0xffd7a6,
    rugRings: 0xf3bd85,
    mote: 0xffffff,
    moteOpacity: 0.42,
    lamp: 0,
    ui: { accent: '#ffb066', accent2: '#7fc6ff' },
  },
  {
    id: 'golden',
    label: 'Golden hour',
    emoji: '🌇',
    skyTop: 0xffc48f,
    skyBottom: 0xffe8c0,
    skyHorizon: 0xfff4da,
    sunColor: 0xffb066,
    sunIntensity: 2.5,
    sunElevation: 20,
    sunAzimuth: 205,
    hemiSky: 0xffdcb5,
    hemiGround: 0xf7cfae,
    hemiIntensity: 0.9,
    fog: 0xffe2ba,
    fogNear: 13,
    fogFar: 46,
    rug: 0xffcf9b,
    rugRings: 0xe9ab72,
    mote: 0xffe9c9,
    moteOpacity: 0.62,
    lamp: 0.18,
    ui: { accent: '#ffa95c', accent2: '#ff8fae' },
  },
  {
    id: 'dusk',
    label: 'Dusk',
    emoji: '🌆',
    skyTop: 0x8b87d6,
    skyBottom: 0xffb0a7,
    skyHorizon: 0xffc9ae,
    sunColor: 0xff9a72,
    sunIntensity: 1.35,
    sunElevation: 5,
    sunAzimuth: 268,
    hemiSky: 0xbfb4e8,
    hemiGround: 0xe0a892,
    hemiIntensity: 0.7,
    fog: 0xeab5ac,
    fogNear: 12,
    fogFar: 40,
    rug: 0xe4a791,
    rugRings: 0xc98a78,
    mote: 0xffd9cd,
    moteOpacity: 0.58,
    lamp: 0.72,
    ui: { accent: '#ff9bb0', accent2: '#9d8ee8' },
  },
  {
    id: 'night',
    label: 'Night',
    emoji: '🌙',
    skyTop: 0x1f2748,
    skyBottom: 0x666a97,
    skyHorizon: 0xa7a4c8,
    sunColor: 0xcfd8ff,
    sunIntensity: 0.6,
    sunElevation: 38,
    sunAzimuth: 302,
    hemiSky: 0x6d7ab5,
    hemiGround: 0x585d84,
    hemiIntensity: 0.6,
    fog: 0x4a5178,
    fogNear: 10,
    fogFar: 36,
    rug: 0x8f8caa,
    rugRings: 0x767395,
    mote: 0xcfd8ff,
    moteOpacity: 0.85,
    lamp: 1,
    ui: { accent: '#a5b4ff', accent2: '#ffa8d8' },
  },
];

/** A live, blended version of a preset (all plain numbers + Color instances). */
export interface PaletteMix {
  label: string;
  emoji: string;
  skyTop: Color;
  skyBottom: Color;
  skyHorizon: Color;
  sunColor: Color;
  sunIntensity: number;
  sunElevation: number;
  sunAzimuth: number;
  hemiSky: Color;
  hemiGround: Color;
  hemiIntensity: number;
  fog: Color;
  fogNear: number;
  fogFar: number;
  rug: Color;
  rugRings: Color;
  mote: Color;
  moteOpacity: number;
  lamp: number;
  accent: string;
  accent2: string;
}

const mixHex = (a: number, b: number, t: number, out: Color): Color => {
  const ca = tmpA.setHex(a);
  const cb = tmpB.setHex(b);
  return out.copy(ca).lerp(cb, t);
};

const tmpA = new Color();
const tmpB = new Color();

export function createMix(): PaletteMix {
  return {
    label: PRESETS[0].label,
    emoji: PRESETS[0].emoji,
    skyTop: new Color(),
    skyBottom: new Color(),
    skyHorizon: new Color(),
    sunColor: new Color(),
    sunIntensity: 1,
    sunElevation: 30,
    sunAzimuth: 120,
    hemiSky: new Color(),
    hemiGround: new Color(),
    hemiIntensity: 1,
    fog: new Color(),
    fogNear: 14,
    fogFar: 46,
    rug: new Color(),
    rugRings: new Color(),
    mote: new Color(),
    moteOpacity: 0.5,
    lamp: 0,
    accent: PRESETS[0].ui.accent,
    accent2: PRESETS[0].ui.accent2,
  };
}

/** Blend two presets into `out`. `t` runs 0 → 1 from `a` to `b`. */
export function blendPresets(a: PalettePreset, b: PalettePreset, t: number, out: PaletteMix): PaletteMix {
  mixHex(a.skyTop, b.skyTop, t, out.skyTop);
  mixHex(a.skyBottom, b.skyBottom, t, out.skyBottom);
  mixHex(a.skyHorizon, b.skyHorizon, t, out.skyHorizon);
  mixHex(a.sunColor, b.sunColor, t, out.sunColor);
  mixHex(a.hemiSky, b.hemiSky, t, out.hemiSky);
  mixHex(a.hemiGround, b.hemiGround, t, out.hemiGround);
  mixHex(a.fog, b.fog, t, out.fog);
  mixHex(a.rug, b.rug, t, out.rug);
  mixHex(a.rugRings, b.rugRings, t, out.rugRings);
  mixHex(a.mote, b.mote, t, out.mote);

  out.sunIntensity = lerp(a.sunIntensity, b.sunIntensity, t);
  // Sun elevation/azimuth move along the short way around the horizon.
  out.sunElevation = lerp(a.sunElevation, b.sunElevation, t);
  let az = a.sunAzimuth;
  let d = (b.sunAzimuth - az) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  out.sunAzimuth = az + d * t;
  out.hemiIntensity = lerp(a.hemiIntensity, b.hemiIntensity, t);
  out.fogNear = lerp(a.fogNear, b.fogNear, t);
  out.fogFar = lerp(a.fogFar, b.fogFar, t);
  out.moteOpacity = lerp(a.moteOpacity, b.moteOpacity, t);
  out.lamp = lerp(a.lamp, b.lamp, t);

  out.label = t < 0.5 ? a.label : b.label;
  out.emoji = t < 0.5 ? a.emoji : b.emoji;
  out.accent = t < 0.5 ? a.ui.accent : b.ui.accent;
  out.accent2 = t < 0.5 ? a.ui.accent2 : b.ui.accent2;
  return out;
}

/** Convert a mix into the four CSS custom properties the UI reads. */
export function applyPaletteToCss(mix: PaletteMix): void {
  const root = document.documentElement.style;
  root.setProperty('--accent', mix.accent);
  root.setProperty('--accent-2', mix.accent2);
  const night = clamp(1 - mix.sunIntensity / 2.4, 0, 1);
  root.setProperty('--ink', night > 0.72 ? '#3b3550' : '#4a3a35');
  root.setProperty('--ink-soft', night > 0.72 ? '#6b6486' : '#7b675f');
  root.setProperty('--glass', `rgba(255, 250, 245, ${(0.78 - night * 0.22).toFixed(2)})`);
}
