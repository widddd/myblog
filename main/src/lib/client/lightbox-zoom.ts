export type Point = { x: number; y: number };

export type LightboxTransform = {
  scale: number;
  x: number;
  y: number;
};

export const LIGHTBOX_MIN_SCALE = 1;
export const LIGHTBOX_MAX_SCALE = 8;
export const LIGHTBOX_FIT_EPSILON = 0.02;

export function clampLightboxScale(
  scale: number,
  min = LIGHTBOX_MIN_SCALE,
  max = LIGHTBOX_MAX_SCALE,
) {
  return Math.min(max, Math.max(min, scale));
}

export function isLightboxFit(scale: number, minScale = LIGHTBOX_MIN_SCALE) {
  return scale <= minScale * (1 + LIGHTBOX_FIT_EPSILON);
}

export function containScale(
  viewWidth: number,
  viewHeight: number,
  contentWidth: number,
  contentHeight: number,
) {
  if (viewWidth < 1 || viewHeight < 1 || contentWidth < 1 || contentHeight < 1) {
    return LIGHTBOX_MIN_SCALE;
  }
  return Math.min(viewWidth / contentWidth, viewHeight / contentHeight);
}

export function maxLightboxScale(minScale: number) {
  return Math.max(minScale, minScale * LIGHTBOX_MAX_SCALE);
}

export function fitCentered(
  viewWidth: number,
  viewHeight: number,
  stageWidth: number,
  stageHeight: number,
  scale = LIGHTBOX_MIN_SCALE,
): LightboxTransform {
  return {
    scale,
    x: (viewWidth - stageWidth * scale) / 2,
    y: (viewHeight - stageHeight * scale) / 2,
  };
}

/** Keep the point under the cursor/pinch origin while changing scale. */
export function zoomAtPoint(
  current: LightboxTransform,
  point: Point,
  nextScale: number,
  min = LIGHTBOX_MIN_SCALE,
  max = LIGHTBOX_MAX_SCALE,
): LightboxTransform {
  const scale = clampLightboxScale(nextScale, min, max);
  const ratio = scale / current.scale;
  return {
    scale,
    x: point.x - ratio * (point.x - current.x),
    y: point.y - ratio * (point.y - current.y),
  };
}

/** Two-finger pinch: scale around the start midpoint, then follow the current midpoint. */
export function applyPinch(
  origin: LightboxTransform,
  startMid: Point,
  startDist: number,
  mid: Point,
  dist: number,
  min = LIGHTBOX_MIN_SCALE,
  max = LIGHTBOX_MAX_SCALE,
): LightboxTransform {
  const nextScale = clampLightboxScale(
    origin.scale * (dist / Math.max(1, startDist)),
    min,
    max,
  );
  const ratio = nextScale / origin.scale;
  return {
    scale: nextScale,
    x: mid.x - ratio * (startMid.x - origin.x),
    y: mid.y - ratio * (startMid.y - origin.y),
  };
}

export function applyPan(
  origin: LightboxTransform,
  from: Point,
  to: Point,
): LightboxTransform {
  return {
    scale: origin.scale,
    x: origin.x + (to.x - from.x),
    y: origin.y + (to.y - from.y),
  };
}

export function wheelFactor(deltaY: number, deltaMode = 0) {
  const dy = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 800 : deltaY;
  return Math.exp(-dy * 0.0018);
}

export function pointerDistance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pointerMidpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
