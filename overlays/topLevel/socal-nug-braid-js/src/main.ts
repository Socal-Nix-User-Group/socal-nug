import { rosterFor } from "./cards.ts";
import { buildBraid } from "./layout.ts";
import { parseData } from "./parse.ts";
import { projectionFor } from "./projections.ts";
import type { Mode } from "./projections.ts";
import { laneRangeOf, renderBraid } from "./render.ts";
import type { DocumentLike, ElementLike } from "./render.ts";
import { readMode, writeMode } from "./toggle.ts";
import type { StorageLike } from "./toggle.ts";

/**
 * Entry point for the Origins braid.
 *
 * The page already contains its whole history as an ordered list. This draws
 * the picture and moves that list out of sight without removing it, so a
 * reader with no JavaScript, and a screen reader either way, still gets the
 * history.
 */

interface PageElement extends ElementLike {
  readonly clientWidth: number;
  readonly classList: {
    add(token: string): void;
    remove(token: string): void;
    toggle(token: string, force: boolean): void;
  };
  readonly dataset: Record<string, string | undefined>;
  replaceChildren(...nodes: ElementLike[]): void;
  addEventListener(type: string, listener: (event: DomEvent) => void): void;
  querySelectorAll(selector: string): ArrayLike<PageElement> & Iterable<
    PageElement
  >;
  getBoundingClientRect(): { width: number };
  animate(frames: unknown[], options: unknown): void;
}

interface DomEvent {
  readonly currentTarget: PageElement;
}

declare const document: DocumentLike & {
  getElementById(id: string): (PageElement & { textContent: string }) | null;
  readonly readyState: string;
  addEventListener(type: string, listener: () => void): void;
};

declare const window: { localStorage: StorageLike } | undefined;
declare const console: { error(...args: unknown[]): void };

const ROW = 46;
const MIN_HEIGHT = 600;
const FALLBACK_WIDTH = 900;
const MORPH_MS = 420;

function storage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function boot(): void {
  const script = document.getElementById("origins-data");
  const mount = document.getElementById("origins-braid");
  if (script === null || mount === null) {
    return;
  }

  let data;
  try {
    data = parseData(JSON.parse(script.textContent));
  } catch (error) {
    // Leave the fallback list standing. A broken blob should cost the
    // drawing, not the history.
    console.error("origins: could not read the page data", error);
    return;
  }

  const braid = buildBraid(data.moments, data.people);
  const lanes = laneRangeOf(braid);
  const store = storage();
  let mode: Mode = readMode(store);
  let previous = new Map<string, { x: number; y: number }>();

  function positionsFor(next: Mode): Map<string, { x: number; y: number }> {
    const width = mount!.clientWidth > 0
      ? mount!.clientWidth
      : FALLBACK_WIDTH;
    const projection = projectionFor(next, {
      width,
      height: Math.max(MIN_HEIGHT, braid.moments.length * ROW),
    }, lanes);
    const out = new Map<string, { x: number; y: number }>();
    for (const placed of braid.moments) {
      const [x, y] = projection.project(placed.t, placed.lane);
      out.set(placed.moment.id, { x, y });
    }
    return out;
  }

  function draw(next: Mode, animate: boolean): void {
    const width = mount!.clientWidth > 0
      ? mount!.clientWidth
      : FALLBACK_WIDTH;
    const projection = projectionFor(next, {
      width,
      height: Math.max(MIN_HEIGHT, braid.moments.length * ROW),
    }, lanes);

    mount!.replaceChildren(renderBraid(braid, projection, document));
    mount!.setAttribute("data-mode", next);

    const now = positionsFor(next);
    if (animate) {
      // The two projections are the same points read differently, so a switch
      // is an interpolation. Transforms animate reliably; path `d` does not.
      for (const node of mount!.querySelectorAll("[data-moment]")) {
        const id = node.dataset.moment;
        const from = id === undefined ? undefined : previous.get(id);
        const to = id === undefined ? undefined : now.get(id);
        if (from === undefined || to === undefined) continue;
        node.animate(
          [
            {
              transform:
                `translate(${from.x - to.x}px, ${from.y - to.y}px)`,
            },
            { transform: "none" },
          ],
          { duration: MORPH_MS, easing: "ease-in-out" },
        );
      }
    }
    previous = now;
    wireHover();
  }

  function highlight(slug: string | undefined, on: boolean): void {
    if (slug === undefined) return;
    for (const node of mount!.querySelectorAll(`[data-person="${slug}"]`)) {
      node.classList.toggle("is-lit", on);
    }
    const roster = document.getElementById("origins-roster");
    if (roster === null) return;
    for (const card of roster.querySelectorAll(`[data-person="${slug}"]`)) {
      card.classList.toggle("is-lit", on);
    }
  }

  function wireHover(): void {
    for (const node of mount!.querySelectorAll("[data-person]")) {
      node.addEventListener("mouseenter", (e) => {
        highlight(e.currentTarget.dataset.person, true);
      });
      node.addEventListener("mouseleave", (e) => {
        highlight(e.currentTarget.dataset.person, false);
      });
    }
  }

  const roster = document.getElementById("origins-roster");
  if (roster !== null) {
    roster.replaceChildren(rosterFor(braid, document));
    for (const card of roster.querySelectorAll("[data-person]")) {
      for (const [type, on] of [
        ["mouseenter", true],
        ["focusin", true],
        ["mouseleave", false],
        ["focusout", false],
      ] as const) {
        card.addEventListener(type, (e) => {
          highlight(e.currentTarget.dataset.person, on);
        });
      }
    }
  }

  draw(mode, false);

  const buttons = document.getElementById("origins-toggle");
  if (buttons !== null) {
    for (const button of buttons.querySelectorAll("[data-origins-mode]")) {
      button.addEventListener("click", (event) => {
        const next = event.currentTarget.dataset.originsMode;
        if (next !== "river" && next !== "map") return;
        if (next === mode) return;
        mode = next;
        writeMode(store, mode);
        draw(mode, true);
        for (const other of buttons.querySelectorAll("[data-origins-mode]")) {
          other.setAttribute(
            "aria-pressed",
            String(other.dataset.originsMode === mode),
          );
        }
      });
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.originsMode === mode),
      );
    }
    buttons.classList.remove("is-hidden");
  }

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
