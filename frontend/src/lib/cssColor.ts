const RGB_PATTERN =
  /^rgba?\(\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)(?:\s*,\s*[\d.]+%?)?\s*\)$/i;

function parseColorChannel(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.endsWith('%')) {
    const percent = Number(trimmed.slice(0, -1));
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;
    return Math.round((percent / 100) * 255);
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || value > 255) return null;
  return Math.round(value);
}

function channelToHex(channel: number): string {
  return channel.toString(16).padStart(2, '0');
}

function expandHexShort(hex: string): string | null {
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return hex
      .split('')
      .map((char) => char + char)
      .join('');
  }
  if (/^[0-9a-fA-F]{4}$/.test(hex)) {
    return hex
      .slice(0, 3)
      .split('')
      .map((char) => char + char)
      .join('');
  }
  return null;
}

function parseHexBody(raw: string): string | null {
  let hex = raw.trim();
  if (hex.startsWith('#')) hex = hex.slice(1);

  if (/^[0-9a-fA-F]{8}$/.test(hex)) {
    hex = hex.slice(0, 6);
  }

  const expanded = expandHexShort(hex);
  if (expanded) hex = expanded;

  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return `#${hex.toLowerCase()}`;
}

/** Parses #hex (with or without #), rgb(), or rgba() — alpha is ignored. */
export function parseCssColorInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const rgbMatch = trimmed.match(RGB_PATTERN);
  if (rgbMatch) {
    const r = parseColorChannel(rgbMatch[1]!);
    const g = parseColorChannel(rgbMatch[2]!);
    const b = parseColorChannel(rgbMatch[3]!);
    if (r === null || g === null || b === null) return null;
    return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`;
  }

  if (trimmed.startsWith('#') || /^[0-9a-fA-F]{3,8}$/.test(trimmed)) {
    return parseHexBody(trimmed);
  }

  return null;
}

export function toHexColor(raw: string | null | undefined, fallback: string): string {
  const parsed = raw ? parseCssColorInput(raw) : null;
  if (parsed) return parsed;
  return parseCssColorInput(fallback) ?? '#000000';
}
