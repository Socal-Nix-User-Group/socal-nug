import { detailFor, personCardFor } from "./cards.ts";
import { drawPlaced } from "./draw.ts";
import type { ElkGraph, Mode } from "./graph.ts";
import { buildBraid } from "./layout.ts";
import { parseData } from "./parse.ts";
import { placeBraid } from "./place.ts";
import { placePopup } from "./popup.ts";
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
  readonly clientHeight: number;
  readonly scrollLeft: number;
  readonly scrollTop: number;
  readonly offsetWidth: number;
  readonly offsetHeight: number;
  hidden: boolean;
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
  getBoundingClientRect(): {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  contains(node: PageElement | null): boolean;
  closest(selector: string): PageElement | null;
  animate(frames: unknown[], options: unknown): void;
}

interface DomEvent {
  readonly currentTarget: PageElement;
  readonly target: PageElement | null;
  readonly key?: string;
}

declare const document: DocumentLike & {
  getElementById(id: string): (PageElement & { textContent: string }) | null;
  readonly readyState: string;
  addEventListener(type: string, listener: (event: DomEvent) => void): void;
};

const XHTML = "http://www.w3.org/1999/xhtml";

declare const window: { localStorage: StorageLike } | undefined;
declare const console: { error(...args: unknown[]): void };

/** The Eclipse Layout Kernel, which the page loads as a classic script. */
declare const ELK: new () => {
  layout(graph: ElkGraph): Promise<ElkGraph>;
};

/** How long the dots take to slide between the two layouts. */
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

  const cast = data.people;
  const braid = buildBraid(data.moments, cast);
  const store = storage();
  let mode: Mode = readMode(store);
  let previous: ReadonlyMap<string, { x: number; y: number }> = new Map();
  const elk = new ELK();
  let drawing = 0;

  // The one card, opened beside whatever was clicked. It lives inside the
  // scrolling map so it pans with it, and is put back after every redraw
  // because replaceChildren would otherwise take it with the old drawing.
  const popup = document.createElementNS(XHTML, "div") as PageElement;
  popup.setAttribute("class", "origins-popup");
  popup.hidden = true;

  async function draw(next: Mode, animate: boolean): Promise<void> {
    // Layout is asynchronous and a reader can switch modes faster than ELK
    // lays out, so a drawing that was overtaken is dropped rather than
    // landing on top of the newer one.
    const token = ++drawing;
    const placed = await placeBraid(braid, next, (graph) => elk.layout(graph));
    if (token !== drawing) return;

    mount!.setAttribute("data-mode", next);
    mount!.replaceChildren(drawPlaced(placed, braid, document), popup);

    const now = placed.moments;
    if (animate) {
      // The two layouts place the same dots, so a switch slides each from
      // where it was to where it is. Transforms animate reliably; `d` does not.
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
    // The old nodes went with replaceChildren, so the card has nothing left to
    // point at.
    closePopup();
    wireHover();
  }

  function highlight(slug: string | undefined, on: boolean): void {
    if (slug === undefined) return;
    for (const node of mount!.querySelectorAll(`[data-person="${slug}"]`)) {
      node.classList.toggle("is-lit", on);
    }
  }

  function markOpen(id: string | undefined): void {
    for (const node of mount!.querySelectorAll("[data-moment]")) {
      node.classList.toggle("is-open", node.dataset.moment === id);
    }
  }

  /**
   * Open the card beside whatever was clicked.
   *
   * Positions are worked out in the map's own scroll coordinates and clamped
   * to the slice of the map on screen, so the card never opens somewhere the
   * reader has to scroll to find. Once open it is part of the map and pans
   * with it.
   */
  function openPopup(anchor: PageElement, content: ElementLike): void {
    popup.replaceChildren(content);
    popup.hidden = false;
    const map = mount!.getBoundingClientRect();
    const at = anchor.getBoundingClientRect();
    const { left, top } = placePopup(
      {
        left: at.left - map.left + mount!.scrollLeft,
        top: at.top - map.top + mount!.scrollTop,
        width: at.width,
        height: at.height,
      },
      { width: popup.offsetWidth, height: popup.offsetHeight },
      {
        left: mount!.scrollLeft,
        top: mount!.scrollTop,
        width: mount!.clientWidth,
        height: mount!.clientHeight,
      },
    );
    popup.setAttribute(
      "style",
      `left:${Math.round(left)}px;top:${Math.round(top)}px`,
    );
    for (const dismiss of popup.querySelectorAll("[data-origins-dismiss]")) {
      dismiss.addEventListener("click", () => closePopup());
    }
  }

  function closePopup(): void {
    popup.hidden = true;
    popup.replaceChildren();
    markOpen(undefined);
  }

  function showMoment(id: string | undefined, anchor: PageElement): void {
    if (id === undefined) return;
    const placed = braid.moments.find((m) => m.moment.id === id);
    if (placed === undefined) return;
    openPopup(anchor, detailFor(placed, cast, document));
    markOpen(id);
  }

  function showPerson(slug: string | undefined, anchor: PageElement): void {
    if (slug === undefined) return;
    const thread = braid.threads.find((t) => t.person.slug === slug);
    if (thread === undefined) return;
    openPopup(anchor, personCardFor(thread, braid, document));
    markOpen(undefined);
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

    // Hovering a moment lights the threads of everyone who was there; clicking
    // it opens the card. Hover is for "who was in this", click is for "tell me
    // about it", which is the part worth dwelling on.
    for (const node of mount!.querySelectorAll("[data-moment]")) {
      const id = node.dataset.moment;
      const placed = braid.moments.find((m) => m.moment.id === id);
      if (placed === undefined) continue;
      const who = placed.moment.people;
      node.addEventListener("mouseenter", () => {
        for (const slug of who) highlight(slug, true);
      });
      node.addEventListener("mouseleave", () => {
        for (const slug of who) highlight(slug, false);
      });
      node.addEventListener("click", (e) => showMoment(id, e.currentTarget));
    }

    // A face opens its person's card. This replaced the roster rail, which
    // was the only other place a person's card could be reached.
    for (const root of mount!.querySelectorAll(".origins-root")) {
      root.addEventListener("click", (e) => {
        showPerson(e.currentTarget.dataset.person, e.currentTarget);
      });
    }
  }

  // Anywhere that is not the card closes it. A click on a node or a face is
  // a request to swap the card, which its own handler does, and the card's
  // own buttons and links handle themselves.
  document.addEventListener("click", (event) => {
    if (popup.hidden) return;
    const target = event.target;
    if (target === null || popup.contains(target)) return;
    if (target.closest("[data-moment], .origins-root") !== null) return;
    closePopup();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePopup();
  });

  void draw(mode, false);

  const buttons = document.getElementById("origins-toggle");
  if (buttons !== null) {
    for (const button of buttons.querySelectorAll("[data-origins-mode]")) {
      button.addEventListener("click", (event) => {
        const next = event.currentTarget.dataset.originsMode;
        if (next !== "river" && next !== "subway") return;
        if (next === mode) return;
        mode = next;
        writeMode(store, mode);
        void draw(mode, true);
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
