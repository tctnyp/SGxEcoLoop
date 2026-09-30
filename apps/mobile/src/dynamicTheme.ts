import { AccessoryId } from './types';

type Hsl = { h: number; s: number; l: number };

export type AccessoryColorScheme = {
  primary: string;
  secondary: string;
  tertiary: string;
  soft: string;
  deep: string;
  glow: string;
  glowSecondary: string;
  onPrimary: string;
  onSecondary: string;
  onTertiary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  background: string;
  surface: string;
  surfaceBright: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  onSurface: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
  inverseSurface: string;
  inverseOnSurface: string;
  scrim: string;
  success: string;
  successContainer: string;
  eventLive: string;
  error: string;
  errorContainer: string;
};

// Saturated physical-product colors are used as the seeds. Material roles are
// generated from these hues so the UI remains expressive without sacrificing
// readable surfaces or WCAG-aware foreground choices.
export const ACCESSORY_COLOR_SEEDS: Record<AccessoryId, string> = {
  'bright-star': '#F2D600',
  'sunny-cap': '#FF7518',
  'petal-pin': '#FF3E78',
  'trail-scarf': '#7856E8',
  'cloud-mitts': '#00A88E',
  'meadow-socks': '#43AD3F',
  'tide-loop': '#009DD8',
};

const FALLBACK_SEED = '#A9D900';

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeHue(hue: number) {
  return ((hue % 360) + 360) % 360;
}

function hexToHsl(hex: string): Hsl {
  const value = hex.replace('#', '');
  const number = Number.parseInt(value.length === 3 ? value.split('').map((part) => part + part).join('') : value.slice(0, 6), 16);
  const red = ((number >> 16) & 255) / 255;
  const green = ((number >> 8) & 255) / 255;
  const blue = (number & 255) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  let hue = 0;
  if (delta) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
  return { h: normalizeHue(hue), s: saturation * 100, l: lightness * 100 };
}

function hsl(hue: number, saturation: number, lightness: number) {
  const normalized = normalizeHue(hue) / 360;
  const saturated = clamp(saturation, 0, 100) / 100;
  const light = clamp(lightness, 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * light - 1)) * saturated;
  const section = normalized * 6;
  const intermediate = chroma * (1 - Math.abs((section % 2) - 1));
  const [red, green, blue] = section < 1 ? [chroma, intermediate, 0]
    : section < 2 ? [intermediate, chroma, 0]
      : section < 3 ? [0, chroma, intermediate]
        : section < 4 ? [0, intermediate, chroma]
          : section < 5 ? [intermediate, 0, chroma]
            : [chroma, 0, intermediate];
  const match = light - chroma / 2;
  return `#${[red, green, blue].map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function hueDistance(left: number, right: number) {
  const distance = Math.abs(normalizeHue(left) - normalizeHue(right));
  return Math.min(distance, 360 - distance);
}

function vividTone(hue: number, lightness = 62) {
  const yellow = hue >= 42 && hue <= 72;
  return hsl(hue, yellow ? 96 : 88, yellow ? Math.min(lightness, 55) : lightness);
}

function relativeLuminance(color: string) {
  const value = color.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(value)) return 0.5;
  const channels = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function onSeed(seed: string) {
  return relativeLuminance(seed) > 0.47 ? '#10231C' : '#FFFFFF';
}

export function createAccessoryColorScheme(accessories: AccessoryId[]): AccessoryColorScheme {
  const unique = [...new Set(accessories)];
  const seeds = (unique.length ? unique : [undefined]).map((id) => id ? ACCESSORY_COLOR_SEEDS[id] : FALLBACK_SEED);
  const hues = seeds.map((seed) => hexToHsl(seed).h);
  const primaryHue = hues[0] ?? hexToHsl(FALLBACK_SEED).h;
  const candidateSecondary = hues[1] ?? normalizeHue(primaryHue + 42);
  const secondaryHue = hueDistance(primaryHue, candidateSecondary) < 24 ? normalizeHue(primaryHue + 42) : candidateSecondary;
  const remainingHue = hues.find((hue, index) => index > 1 && hueDistance(hue, primaryHue) >= 35 && hueDistance(hue, secondaryHue) >= 28);
  const splitA = normalizeHue(primaryHue + 148);
  const splitB = normalizeHue(primaryHue - 148);
  const tertiaryHue = remainingHue ?? (hueDistance(splitA, secondaryHue) > hueDistance(splitB, secondaryHue) ? splitA : splitB);

  const primary = vividTone(primaryHue, 63);
  const secondary = vividTone(secondaryHue, 64);
  const tertiary = vividTone(tertiaryHue, 63);
  return {
    primary,
    secondary,
    tertiary,
    soft: hsl(primaryHue, 88, 90),
    deep: hsl(primaryHue, 62, primaryHue >= 42 && primaryHue <= 72 ? 24 : 31),
    glow: vividTone(primaryHue, 66),
    glowSecondary: vividTone(secondaryHue, 67),
    onPrimary: onSeed(primary),
    onSecondary: onSeed(secondary),
    onTertiary: onSeed(tertiary),
    primaryContainer: hsl(primaryHue, 92, 86),
    onPrimaryContainer: hsl(primaryHue, 58, 18),
    secondaryContainer: hsl(secondaryHue, 86, 88),
    onSecondaryContainer: hsl(secondaryHue, 55, 20),
    tertiaryContainer: hsl(tertiaryHue, 84, 89),
    onTertiaryContainer: hsl(tertiaryHue, 54, 21),
    background: hsl(primaryHue, 42, 97),
    surface: hsl(primaryHue, 34, 98),
    surfaceBright: '#FFFFFF',
    surfaceContainerLow: hsl(primaryHue, 42, 95),
    surfaceContainer: hsl(primaryHue, 38, 92),
    surfaceContainerHigh: hsl(primaryHue, 36, 88),
    onSurface: hsl(primaryHue, 24, 15),
    onSurfaceVariant: hsl(primaryHue, 17, 34),
    outline: hsl(primaryHue, 17, 53),
    outlineVariant: hsl(primaryHue, 24, 79),
    inverseSurface: hsl(primaryHue, 30, 20),
    inverseOnSurface: hsl(primaryHue, 36, 95),
    scrim: '#000000',
    success: '#087A4B',
    successContainer: '#B8F4D2',
    eventLive: '#E93D4F',
    error: '#BA1A1A',
    errorContainer: '#FFDAD6',
  };
}
