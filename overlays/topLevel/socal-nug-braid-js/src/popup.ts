/**
 * Where a card opens, relative to the thing that was clicked.
 *
 * Everything here is in the map's own scroll coordinates: `view` is the slice
 * of the map on screen right now, `anchor` the node or face under the pointer.
 * The card is a child of the scrolling container, so it moves with the map
 * once it is open; this only decides where it lands.
 */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Between the anchor and the card. */
const GAP = 10;
/** Between the card and the edge of what is on screen. */
const EDGE = 8;

/**
 * To the right of the anchor, centred on it. Flips to the left when the right
 * would leave the screen, and is simply held on screen when neither fits. A
 * card the reader has to scroll to find might as well not have opened.
 */
export function placePopup(
  anchor: Box,
  size: Size,
  view: Box,
): { left: number; top: number } {
  const minLeft = view.left + EDGE;
  const maxLeft = view.left + view.width - size.width - EDGE;
  const rightOf = anchor.left + anchor.width + GAP;
  const leftOf = anchor.left - GAP - size.width;

  let left: number;
  if (rightOf <= maxLeft) {
    left = rightOf;
  } else if (leftOf >= minLeft) {
    left = leftOf;
  } else {
    left = Math.max(minLeft, Math.min(rightOf, maxLeft));
  }

  const minTop = view.top + EDGE;
  const maxTop = view.top + view.height - size.height - EDGE;
  const centred = anchor.top + anchor.height / 2 - size.height / 2;
  // Taller than the screen: pin to the top so at least the head is readable.
  const top = maxTop < minTop
    ? minTop
    : Math.max(minTop, Math.min(centred, maxTop));

  return { left, top };
}
