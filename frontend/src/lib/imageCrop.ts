export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function centeredSquare(nw: number, nh: number): CropRect {
  const side = Math.min(nw, nh);
  return {
    x: Math.floor((nw - side) / 2),
    y: Math.floor((nh - side) / 2),
    width: side,
    height: side,
  };
}

export function clampCrop(c: CropRect, nw: number, nh: number): CropRect {
  const side = Math.min(c.width, c.height, nw, nh);
  const x = Math.max(0, Math.min(c.x, nw - side));
  const y = Math.max(0, Math.min(c.y, nh - side));
  return { x, y, width: side, height: side };
}

export function resizeCropAroundCenter(
  crop: CropRect,
  side: number,
  nw: number,
  nh: number,
): CropRect {
  const centerX = crop.x + crop.width / 2;
  const centerY = crop.y + crop.height / 2;
  const safeSide = Math.max(1, Math.min(side, nw, nh));
  return clampCrop(
    {
      x: centerX - safeSide / 2,
      y: centerY - safeSide / 2,
      width: safeSide,
      height: safeSide,
    },
    nw,
    nh,
  );
}

export function parseServerCrop(json: string | null | undefined): CropRect | null {
  if (!json) return null;
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    const x = Number(o.x);
    const y = Number(o.y);
    const w = Number(o.width);
    const h = Number(o.height);
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
    return { x, y, width: w, height: h };
  } catch {
    return null;
  }
}

export function getImageLayout(img: HTMLImageElement) {
  const cw = img.clientWidth;
  const ch = img.clientHeight;
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const ratio = Math.min(cw / nw, ch / nh);
  const dw = nw * ratio;
  const dh = nh * ratio;
  const ox = (cw - dw) / 2;
  const oy = (ch - dh) / 2;
  return { ratio, ox, oy, nw, nh, cw, ch };
}

export function cropToJson(crop: CropRect): string {
  return JSON.stringify(crop);
}
