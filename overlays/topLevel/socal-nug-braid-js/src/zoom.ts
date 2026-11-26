/**
 * How far the map is zoomed. 1 is the size the layout drew it at.
 *
 * Only the arithmetic lives here, so it can be tested without a browser. The
 * page decides what a zoom is applied to and what stays under the pointer.
 */

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 3;

/** One press of a zoom button. */
const STEP = 1.25;
/** How much one pixel of wheel zooms. */
const WHEEL_RATE = 0.005;
/** The most one wheel event counts for, in pixels. */
const WHEEL_CAP = 50;
/** The height of a line, for a wheel that reports lines. */
const LINE = 16;

function clamp(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/** One step in (1) or out (-1). */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  return clamp(direction === 1 ? zoom * STEP : zoom / STEP);
}

/**
 * The zoom after one wheel event.
 *
 * A pinch on a trackpad arrives as a stream of small deltas and each counts
 * for what it is. A notch of a mouse wheel arrives as one large delta, a
 * hundred pixels or three lines depending on the browser, and is capped so a
 * notch is about one press of a button whichever it was.
 */
export function wheelZoom(
  zoom: number,
  deltaY: number,
  /** WheelEvent.deltaMode: 0 is pixels, anything else is lines or pages. */
  deltaMode: number,
): number {
  const pixels = deltaMode === 0 ? deltaY : deltaY * LINE;
  const counted = Math.min(WHEEL_CAP, Math.max(-WHEEL_CAP, pixels));
  return clamp(zoom * Math.exp(-counted * WHEEL_RATE));
}

interface Size {
  readonly width: number;
  readonly height: number;
}

/** The zoom at which the canvas is whole inside the box. Never above 1. */
export function fitZoom(canvas: Size, box: Size): number {
  return clamp(
    Math.min(1, box.width / canvas.width, box.height / canvas.height),
  );
}
