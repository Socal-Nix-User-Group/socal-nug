import { buildBraid } from "./layout.ts";
import { parseData } from "./parse.ts";
import { projectionFor } from "./projections.ts";
import { laneRangeOf, renderBraid } from "./render.ts";
import type { DocumentLike, ElementLike } from "./render.ts";

/**
 * Entry point for the Origins braid.
 *
 * The page already contains its whole history as an ordered list. This script
 * draws the picture and moves that list out of sight without removing it, so
 * a reader with no JavaScript, and a screen reader either way, still gets the
 * history.
 */

/** Not an ElementLike: the real DOM's textContent is nullable. */
interface PageElement {
  readonly textContent: string | null;
  readonly clientWidth: number;
  readonly classList: { add(token: string): void };
  appendChild(child: ElementLike): ElementLike;
}

declare const document: DocumentLike & {
  getElementById(id: string): PageElement | null;
  readonly readyState: string;
  addEventListener(type: string, listener: () => void): void;
};

declare const console: { error(...args: unknown[]): void };

const ROW = 46;
const MIN_HEIGHT = 600;
const FALLBACK_WIDTH = 800;

function boot(): void {
  const script = document.getElementById("origins-data");
  const mount = document.getElementById("origins-braid");
  if (script === null || mount === null) {
    return;
  }

  let data;
  try {
    data = parseData(JSON.parse(script.textContent ?? ""));
  } catch (error) {
    // Leave the fallback list standing; a broken blob should cost the drawing,
    // not the history.
    console.error("origins: could not read the page data", error);
    return;
  }

  const braid = buildBraid(data.moments, data.people);
  const projection = projectionFor(
    "river",
    {
      width: mount.clientWidth > 0 ? mount.clientWidth : FALLBACK_WIDTH,
      height: Math.max(MIN_HEIGHT, braid.moments.length * ROW),
    },
    laneRangeOf(braid),
  );

  mount.appendChild(renderBraid(braid, projection, document));

  const fallback = document.getElementById("origins-fallback");
  if (fallback !== null) {
    fallback.classList.add("is-visually-hidden");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
