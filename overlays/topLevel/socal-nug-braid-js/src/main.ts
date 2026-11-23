import { detailFor, personCardFor, rosterFor } from "./cards.ts";
import { drawPlaced } from "./draw.ts";
import { focusOrder, nextIndex } from "./focus.ts";
import type { ElkGraph, Mode } from "./graph.ts";
import { buildBraid } from "./layout.ts";
import { parseData } from "./parse.ts";
import { centreIn, placeBraid } from "./place.ts";
import type { Placed } from "./place.ts";
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
  focus(options?: { preventScroll?: boolean }): void;
  animate(frames: unknown[], options: unknown): void;
}

interface DomEvent {
  readonly currentTarget: PageElement;
  readonly target: PageElement | null;
  readonly key?: string;
  /** "mouse", "pen" or "touch", on pointer events. */
  readonly pointerType?: string;
  preventDefault(): void;
}

declare const document: DocumentLike & {
  getElementById(id: string): (PageElement & { textContent: string }) | null;
  readonly readyState: string;
  readonly activeElement: PageElement | null;
  addEventListener(type: string, listener: (event: DomEvent) => void): void;
};

const XHTML = "http://www.w3.org/1999/xhtml";

declare const window: {
  localStorage: StorageLike;
  addEventListener(type: string, listener: () => void): void;
  setTimeout(body: () => void, ms: number): number;
  clearTimeout(handle: number): void;
  matchMedia(query: string): { readonly matches: boolean };
} | undefined;
declare const console: { error(...args: unknown[]): void };

/** The Eclipse Layout Kernel, which the page loads as a classic script. */
declare const ELK: new () => {
  layout(graph: ElkGraph): Promise<ElkGraph>;
};

/** How long the dots take to slide between the two layouts. */
const MORPH_MS = 420;
/** How long a window drag has to stop before the picture is redrawn. */
const RESIZE_SETTLE_MS = 150;

function storage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Whether the reader has asked their system for less motion. */
function wantsStill(): boolean {
  return window !== undefined &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Hover is a pointer that can hover. A finger enters a thing by tapping it
 * and never leaves, so a tap used to light a moment's threads and leave them
 * lit.
 */
const hovers = (event: DomEvent): boolean => event.pointerType !== "touch";

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
  // Made on first use, inside the drawing, not here. The engine is a second
  // script and can fail to arrive; reaching for it at boot threw before the
  // roster was built, so a missing picture took the people with it.
  let elk: InstanceType<typeof ELK> | undefined;
  let drawing = 0;
  /**
   * What ELK made of each mode, before it was centred in anything.
   *
   * The layout does not depend on the width of the box, so a window resize
   * re-centres one of these rather than running the engine again, and a
   * second visit to a mode is instant.
   */
  const laidOut = new Map<Mode, Placed>();
  let shownAt = 0;

  // The one card, opened beside whatever was clicked. It lives inside the
  // scrolling map so it pans with it, and is put back after every redraw
  // because replaceChildren would otherwise take it with the old drawing.
  const popup = document.createElementNS(XHTML, "div") as PageElement;
  popup.setAttribute("class", "origins-popup");
  popup.hidden = true;
  /** What opened the card, so focus can go back to it when the card closes. */
  let openedBy: PageElement | null = null;

  async function draw(next: Mode, animate: boolean): Promise<void> {
    // Layout is asynchronous and a reader can switch modes faster than ELK
    // lays out, so a drawing that was overtaken is dropped rather than
    // landing on top of the newer one.
    const token = ++drawing;

    // Set the mode before measuring. River gives a column to the roster and
    // Subway does not, so reading clientWidth first measures the layout we
    // are leaving and centres the picture in a box it is not in.
    mount!.setAttribute("data-mode", next);
    document.getElementById("origins-layout")?.setAttribute("data-mode", next);
    let bare = laidOut.get(next);
    if (bare === undefined) {
      bare = await placeBraid(
        braid,
        next,
        (graph) => (elk ??= new ELK()).layout(graph),
      );
      if (token !== drawing) return;
      laidOut.set(next, bare);
    }

    shownAt = mount!.clientWidth;
    const placed = centreIn(bare, shownAt);
    mount!.replaceChildren(drawPlaced(placed, braid, document), popup);

    const now = placed.moments;
    if (animate && !wantsStill()) {
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
    wireKeyboard();
  }

  // Lighting a person lights them everywhere: their line and face in the
  // picture, and their card in the roster, in both directions.
  const roster = document.getElementById("origins-roster");

  function highlight(slug: string | undefined, on: boolean): void {
    if (slug === undefined) return;
    for (const node of mount!.querySelectorAll(`[data-person="${slug}"]`)) {
      node.classList.toggle("is-lit", on);
    }
    if (roster === null) return;
    for (const card of roster.querySelectorAll(`[data-person="${slug}"]`)) {
      card.classList.toggle("is-lit", on);
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
  function openPopup(
    anchor: PageElement,
    content: ElementLike,
    byKeyboard = false,
  ): void {
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

    // Opened by keyboard: focus goes into the card, so what comes next is
    // the card's own content rather than the rest of the picture. Opened by
    // pointer, focus stays where the reader put it.
    openedBy = anchor;
    if (byKeyboard) {
      const dismiss = popup.querySelectorAll("[data-origins-dismiss]")[0];
      if (dismiss !== undefined) dismiss.focus();
    }
  }

  function closePopup(): void {
    // Read before the card is emptied: afterwards focus is nowhere.
    const hadFocus = popup.contains(document.activeElement);
    popup.hidden = true;
    popup.replaceChildren();
    markOpen(undefined);
    // Back to whatever opened it, when focus was in the card. Without this,
    // closing a card by keyboard drops focus onto the body and the next Tab
    // starts from the top of the page, which loses the reader's place in the
    // story. Only then: a reader who clicked somewhere else to close the card
    // has put focus where they want it, and taking it back to the dot also
    // scrolled the page back to it.
    if (hadFocus && openedBy !== null) {
      openedBy.focus({ preventScroll: true });
    }
    openedBy = null;
  }

  function showMoment(
    id: string | undefined,
    anchor: PageElement,
    byKeyboard = false,
  ): void {
    if (id === undefined) return;
    const placed = braid.moments.find((m) => m.moment.id === id);
    if (placed === undefined) return;
    openPopup(anchor, detailFor(placed, cast, document), byKeyboard);
    markOpen(id);
  }

  function showPerson(
    slug: string | undefined,
    anchor: PageElement,
    byKeyboard = false,
  ): void {
    if (slug === undefined) return;
    const thread = braid.threads.find((t) => t.person.slug === slug);
    if (thread === undefined) return;
    openPopup(anchor, personCardFor(thread, braid, document), byKeyboard);
    markOpen(undefined);
  }

  // --- the roving tabindex ---------------------------------------------------
  // The picture is one tab stop. The arrow keys move the cursor through the
  // story, and only the target under it is tabbable, so tabbing past the
  // braid takes one press rather than forty-six.

  const order = focusOrder(braid);
  let cursor = 0;

  const elementAt = (index: number): PageElement | null => {
    const target = order[index];
    if (target === undefined) return null;
    const selector = target.kind === "moment"
      ? `[data-moment="${target.id}"]`
      : `.origins-root[data-person="${target.id}"]`;
    return mount!.querySelectorAll(selector)[0] ?? null;
  };

  /** Promote one target into the tab order and demote the rest. */
  function markCursor(index: number, focusIt: boolean): void {
    cursor = Math.min(Math.max(index, 0), Math.max(0, order.length - 1));
    for (const node of mount!.querySelectorAll("[role='button']")) {
      node.setAttribute("tabindex", "-1");
    }
    const node = elementAt(cursor);
    if (node === null) return;
    node.setAttribute("tabindex", "0");
    if (focusIt) node.focus();
  }

  function openAt(index: number, byKeyboard: boolean): void {
    const target = order[index];
    const node = elementAt(index);
    if (target === undefined || node === null) return;
    if (target.kind === "moment") showMoment(target.id, node, byKeyboard);
    else showPerson(target.id, node, byKeyboard);
  }

  function wireKeyboard(): void {
    for (const node of mount!.querySelectorAll("[role='button']")) {
      // Clicking or focusing a target makes it the cursor, so the arrows
      // carry on from wherever the reader actually is.
      node.addEventListener("focus", (event) => {
        const at = indexOfNode(event.currentTarget);
        if (at >= 0) markCursor(at, false);
      });
      node.addEventListener("keydown", (event) => {
        if (event.key === undefined) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openAt(cursor, true);
          return;
        }
        const next = nextIndex(cursor, event.key, order.length);
        if (next === null) return;
        event.preventDefault();
        markCursor(next, true);
      });
    }
    markCursor(cursor, false);
  }

  function indexOfNode(node: PageElement): number {
    const moment = node.dataset.moment;
    const person = node.dataset.person;
    return order.findIndex((t) =>
      t.kind === "moment" ? t.id === moment : t.id === person
    );
  }

  function wireHover(): void {
    for (const node of mount!.querySelectorAll("[data-person]")) {
      node.addEventListener("pointerenter", (e) => {
        if (hovers(e)) highlight(e.currentTarget.dataset.person, true);
      });
      node.addEventListener("pointerleave", (e) => {
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
      node.addEventListener("pointerenter", (e) => {
        if (!hovers(e)) return;
        for (const slug of who) highlight(slug, true);
      });
      node.addEventListener("pointerleave", () => {
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

  if (roster !== null) {
    roster.replaceChildren(rosterFor(braid, document));
    for (const card of roster.querySelectorAll("[data-person]")) {
      for (
        const [type, on] of [
          ["pointerenter", true],
          ["focusin", true],
          ["pointerleave", false],
          ["focusout", false],
        ] as const
      ) {
        card.addEventListener(type, (event) => {
          if (on && !hovers(event)) return;
          highlight(event.currentTarget.dataset.person, on);
        });
      }
    }
  }

  // The canvas is sized to its box, so a resized window needs a redraw. It
  // needs no new layout though, only re-centring, which is why this can run
  // on a drag at all. Settle first: a drag fires continuously, and the width
  // that matters is the one it stops at.
  if (window !== undefined) {
    let settling = 0;
    window.addEventListener("resize", () => {
      window.clearTimeout(settling);
      settling = window.setTimeout(() => {
        if (mount!.clientWidth === shownAt) return;
        void draw(mode, false);
      }, RESIZE_SETTLE_MS);
    });
  }

  const buttons = document.getElementById("origins-toggle");
  if (buttons !== null) {
    // Which mode is on has to be visible as well as announced. The same two
    // Bulma classes the theme switcher in the navbar uses, so the two
    // controls read alike.
    const showMode = (): void => {
      for (const button of buttons.querySelectorAll("[data-origins-mode]")) {
        const on = button.dataset.originsMode === mode;
        button.classList.toggle("is-link", on);
        button.classList.toggle("is-selected", on);
        button.setAttribute("aria-pressed", String(on));
      }
    };
    for (const button of buttons.querySelectorAll("[data-origins-mode]")) {
      button.addEventListener("click", (event) => {
        const next = event.currentTarget.dataset.originsMode;
        if (next !== "river" && next !== "subway") return;
        if (next === mode) return;
        mode = next;
        writeMode(store, mode);
        draw(mode, true).catch((error: unknown) => {
          // The picture already on screen stays; only the switch is lost.
          console.error("origins: could not switch mode", error);
        });
        showMode();
      });
    }
    showMode();
  }

  draw(mode, false).then(() => {
    // Shown once there is a picture to switch, so a reader whose layout
    // engine never arrived is not offered a control that does nothing.
    buttons?.classList.remove("is-hidden");
  }).catch((error: unknown) => {
    console.error("origins: could not lay out the braid", error);
    // Say so in the box. The roster beside it still lists everyone; an
    // empty box with nothing in it reads as a page that has not finished.
    const sorry = document.createElementNS(XHTML, "p");
    sorry.setAttribute("class", "origins-failed");
    sorry.textContent =
      "The picture could not be drawn. Reloading the page may bring it back.";
    mount.replaceChildren(sorry);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
