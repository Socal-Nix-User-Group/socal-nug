import { detailFor, listsFor, personCardFor } from "./cards.ts";
import type { ElkGraph, Mode } from "./elk.ts";
import { focusOrder, nextIndex } from "./focus.ts";
import { drawLoom, HIT } from "./loom-draw.ts";
import { centreLoomIn, placeLoom } from "./loom-place.ts";
import type { LoomPlaced } from "./loom-place.ts";
import { ease, frameAt, MORPH_MS, morphBetween, OPENING, scrollFor, sharesOf } from "./morph.ts";
import type { Shares } from "./morph.ts";
import { parseData } from "./parse.ts";
import { centred, framed, litBy, toggled } from "./pick.ts";
import type { Pick } from "./pick.ts";
import { placePopup } from "./popup.ts";
import type { DocumentLike, ElementLike } from "./render.ts";
import { buildStory } from "./story.ts";
import { readMode, writeMode } from "./toggle.ts";
import type { StorageLike } from "./toggle.ts";
import { fitZoom, stepZoom, wheelZoom, ZOOM_MAX, ZOOM_MIN } from "./zoom.ts";

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
  readonly scrollWidth: number;
  readonly scrollHeight: number;
  scrollLeft: number;
  scrollTop: number;
  scrollTo(to: { left: number; top: number; behavior: "smooth" | "auto" }): void;
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
  addEventListener(
    type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel" | "wheel",
    listener: (event: PointerInput) => void,
    options?: { passive: boolean },
  ): void;
  addEventListener(
    type: string,
    listener: (event: DomEvent) => void,
    capture?: boolean,
  ): void;
  setPointerCapture(pointer: number): void;
  removeAttribute(name: string): void;
  /** On SVG text. */
  getComputedTextLength(): number;
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
}

interface DomEvent {
  readonly currentTarget: PageElement;
  readonly target: PageElement | null;
  readonly key?: string;
  /** "mouse", "pen" or "touch", on pointer events. */
  readonly pointerType?: string;
  /** How many clicks this is. 0 for one made by the keyboard. */
  readonly detail?: number;
  preventDefault(): void;
  stopPropagation(): void;
}

/** What a pointer or a wheel says about where it is and what is held. */
interface PointerInput extends DomEvent {
  readonly clientX: number;
  readonly clientY: number;
  readonly pointerId: number;
  /** The button that changed: 0 is the primary one. */
  readonly button: number;
  /** Every button now held, as bits: 1 is the primary one. */
  readonly buttons: number;
  readonly ctrlKey: boolean;
  readonly deltaY: number;
  readonly deltaMode: number;
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
  requestAnimationFrame(body: (now: number) => void): number;
  matchMedia(query: string): { readonly matches: boolean };
} | undefined;
declare const console: { error(...args: unknown[]): void };
declare function getComputedStyle(element: ElementLike): {
  readonly maxHeight: string;
};

/** The Eclipse Layout Kernel, which the page loads as a classic script. */
declare const ELK: new () => {
  layout(graph: ElkGraph): Promise<ElkGraph>;
};

/** How long a window drag has to stop before the picture is redrawn. */
const RESIZE_SETTLE_MS = 150;

/** How far a pressed mouse has to travel before it is a drag and not a click. */
const GRAB_SLOP = 4;

/** How long after the first picture the other mode is laid out. */
const OTHER_MODE_AFTER_MS = 1500;

function storage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
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
  const story = buildStory(data.moments, cast);
  const store = storage();
  let mode: Mode = readMode(store);
  // Made on first use, inside the drawing, not here. The engine is a second
  // script and can fail to arrive; reaching for it at boot threw before the
  // roster was built, so a missing picture took the people with it.
  let elk: InstanceType<typeof ELK> | undefined;
  let drawing = 0;
  /**
   * What ELK is making, or made, of each mode, before it was centred in
   * anything.
   *
   * The layout does not depend on the width of the box, so a window resize
   * re-centres one of these rather than running the engine again, and a
   * second visit to a mode is instant. The promise is kept rather than what
   * it gives, so a switch made while the other mode is still being laid out
   * waits for that layout instead of starting another.
   */
  const laidOut = new Map<Mode, Promise<LoomPlaced>>();
  function layoutOf(next: Mode): Promise<LoomPlaced> {
    let made = laidOut.get(next);
    if (made === undefined) {
      made = placeLoom(
        story,
        next,
        (graph) => (elk ??= new ELK()).layout(graph),
      );
      laidOut.set(next, made);
      // Forgotten when it fails, so the next attempt runs the engine again
      // rather than failing the same way for the rest of the visit.
      made.catch(() => {
        if (laidOut.get(next) === made) laidOut.delete(next);
      });
    }
    return made;
  }
  let shownAt = 0;
  /** What is on screen, centred in its box, for a morph to start from. */
  let shown: LoomPlaced | null = null;
  /** A morph is under way. */
  let morphing = false;
  /** How far the map is zoomed. 1 is the size the layout drew it at. */
  let zoom = 1;
  /** The zoom was last set by Fit, so a switch arrives at the other mode's fit. */
  let fitted = false;
  /**
   * How far along and across the view was when the last switch carried it.
   * The next switch falls back on it for an axis this mode cannot scroll.
   */
  let carried: Shares | undefined;
  /** The canvas as it was drawn, before any zoom. */
  let canvas = { width: 0, height: 0 };

  // The one card, opened beside whatever was clicked. It lives inside the
  // scrolling map so it pans with it, and is put back after every redraw
  // because replaceChildren would otherwise take it with the old drawing.
  const popup = document.createElementNS(XHTML, "div") as PageElement;
  popup.setAttribute("class", "origins-popup");
  popup.hidden = true;
  /** What opened the card, so focus can go back to it when the card closes. */
  let openedBy: PageElement | null = null;
  /**
   * The card in a list the keyboard last sent focus to, beside the map, so
   * Escape can send it back to the map while it is still there.
   */
  let sentTo: PageElement | null = null;

  /**
   * How far the box can scroll, found by asking it to go too far. The sizes
   * it reports do not say: the room kept for a scrollbar is counted in them
   * and cannot be scrolled into.
   */
  function reachOf(): { x: number; y: number } {
    const at = { x: mount!.scrollLeft, y: mount!.scrollTop };
    mount!.scrollLeft = 1e7;
    mount!.scrollTop = 1e7;
    const reach = { x: mount!.scrollLeft, y: mount!.scrollTop };
    mount!.scrollLeft = at.x;
    mount!.scrollTop = at.y;
    return reach;
  }

  /**
   * Draw `next`. Given a `view`, the box is scrolled to that share of the way
   * along and across the new picture: where a first picture opens, or where
   * a switch that does not travel carries the view to. Without one the box
   * keeps the place it had, which is what a resize wants.
   */
  async function draw(next: Mode, view?: Shares): Promise<void> {
    // Layout is asynchronous and a reader can switch modes faster than ELK
    // lays out, so a drawing that was overtaken is dropped rather than
    // landing on top of the newer one.
    const token = ++drawing;

    // Set the mode before measuring. River gives a column to the roster and
    // Subway does not, so reading clientWidth first measures the layout we
    // are leaving and centres the picture in a box it is not in.
    mount!.setAttribute("data-mode", next);
    document.getElementById("origins-layout")?.setAttribute("data-mode", next);
    const bare = await layoutOf(next);
    if (token !== drawing) return;

    shownAt = mount!.clientWidth;
    const placed = centreLoomIn(bare, shownAt);
    canvas = { width: placed.width, height: placed.height };
    shown = placed;
    mount!.replaceChildren(drawLoom(placed, story, document), popup);
    sizeMap();
    if (view !== undefined) {
      const to = scrollFor(next, view, reachOf());
      mount!.scrollLeft = to.x;
      mount!.scrollTop = to.y;
    }

    // The old nodes went with replaceChildren, so the card has nothing left to
    // point at.
    closePopup();
    wireHover();
    wireKeyboard();
    // What would have said the pointer left went with the old picture, and
    // the new one is lit by nothing yet. The pick outlives it.
    hovered.clear();
    over = null;
    relight();
  }

  /**
   * Switch to `next` by moving everything from where it is in this mode to
   * where it will be in that one: inside the picture, the picture's size, the
   * map's box and the cards of both lists. Where there is nothing to move from, or
   * the reader asks for less motion, or the two layouts do not pair up, it is
   * the plain redraw.
   */
  async function morph(next: Mode): Promise<void> {
    const from = shown;
    const svg = picture();
    if (
      from === null || svg === undefined || morphing || window === undefined ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      // No journey, but the view lands where the journey would have taken it.
      if (from !== null) {
        const here = { x: mount!.scrollLeft, y: mount!.scrollTop };
        carried = sharesOf(from.mode, here, reachOf(), carried);
      }
      return draw(next, carried ?? OPENING);
    }
    morphing = true;
    const layout = document.getElementById("origins-layout");
    const lists = roster === null
      ? []
      : [...roster.querySelectorAll(".origins-roster, .origins-moments")];
    // Both lists' cards and both headings, in the page's order.
    const items = roster === null ? [] : [
      ...roster.querySelectorAll(
        ".origins-pane-title, .origins-roster-item, .origins-moments-item",
      ),
    ];
    /**
     * Where each list is scrolled to in the mode arrived at. Lifting its
     * cards out empties a list, and an empty box scrolls back to its start.
     */
    let scrolled: { x: number; y: number }[] = [];
    /** Take off everything the journey set outside the picture. */
    const tidy = (): void => {
      mount!.classList.remove("is-morphing");
      mount!.removeAttribute("style");
      layout?.removeAttribute("style");
      for (const list of lists) list.removeAttribute("style");
      for (const item of items) item.removeAttribute("style");
      scrolled.forEach((at, i) => {
        lists[i].scrollLeft = at.x;
        lists[i].scrollTop = at.y;
      });
    };
    // Once the page says it is in the other mode, it has to end showing the
    // ordinary picture for that mode, however the journey ends.
    let flipped = false;
    let landed = false;
    try {
      const bare = await layoutOf(next);
      closePopup();
      // A grab under way would fight the journey for the scroll position.
      letGo();

      const rect = (e: PageElement) => {
        const b = e.getBoundingClientRect();
        return { x: b.left, y: b.top, w: b.width, h: b.height };
      };
      // Where everything is now. From here to putting this picture back,
      // nothing is painted, so the reader never sees the page in between.
      const box0 = rect(mount!);
      const scroll0 = { x: mount!.scrollLeft, y: mount!.scrollTop };
      const shares = sharesOf(from.mode, scroll0, reachOf(), carried);
      carried = shares;
      const lists0 = lists.map(rect);
      const cards0 = items.map(rect);

      // Where everything will be: the page in the other mode, with the other
      // picture in the box at the zoom it will arrive at.
      flipped = true;
      mount!.setAttribute("data-mode", next);
      layout?.setAttribute("data-mode", next);
      const width1 = mount!.clientWidth;
      const to = centreLoomIn(bare, width1);
      // A view fitted to its box arrives fitted to the other box, which is a
      // different zoom: the two pictures are different shapes. Any other zoom
      // is kept as it is.
      const zoom0 = zoom;
      const zoom1 = fitted
        ? fitZoom(to, {
          width: width1,
          height: parseFloat(getComputedStyle(mount!).maxHeight),
        })
        : zoom;
      const target = drawLoom(to, story, document) as PageElement;
      target.setAttribute(
        "style",
        `width:${to.width * zoom1}px;height:${to.height * zoom1}px`,
      );
      mount!.replaceChildren(target, popup);
      const box1 = rect(mount!);
      const scroll1 = scrollFor(next, shares, reachOf());
      const lists1 = lists.map(rect);
      const cards1 = items.map(rect);
      scrolled = lists.map((list) => ({ x: list.scrollLeft, y: list.scrollTop }));
      // The heading over a list is lifted out with its cards, so the list
      // keeps the heading's room as well as its own: from the top of its
      // pane to its own foot.
      const rooms = lists.map((list, i) =>
        lists1[i].y + lists1[i].h - rect(list.closest(".origins-pane")!).y
      );
      const origin = layout === null ? { x: 0, y: 0 } : rect(layout);
      mount!.replaceChildren(svg, popup);
      mount!.scrollLeft = scroll0.x;
      mount!.scrollTop = scroll0.y;

      // Labels are drawn in the story's order, for the moments that have one.
      const texts = [...svg.querySelectorAll("text.origins-label")];
      const labelled = story.moments
        .map((g) => g.moment.id)
        .filter((id) => from.labels.has(id));
      const widths = new Map(
        labelled.map((id, i) => [id, texts[i].getComputedTextLength()]),
      );
      const journey = morphBetween(story, from, to, widths);
      // The page is in the other mode already, with this picture back in the
      // box; the plain redraw below replaces it.
      if (journey === null) return;

      // A card is in sight in a mode where it overlaps its own list's box
      // there. One out of sight at one end fades in or out on the way, and
      // one out of sight at both is not shown at all. A heading is in no list
      // and always shows.
      const own = items.map((item) => lists.findIndex((list) => list.contains(item)));
      const inSight = (
        c: { x: number; y: number; w: number; h: number },
        l: { x: number; y: number; w: number; h: number },
      ) => c.x < l.x + l.w && l.x < c.x + c.w && c.y < l.y + l.h && l.y < c.y + c.h;
      const seen0 = items.map((_, i) =>
        own[i] < 0 || inSight(cards0[i], lists0[own[i]]) ? 1 : 0
      );
      const seen1 = items.map((_, i) =>
        own[i] < 0 || inSight(cards1[i], lists1[own[i]]) ? 1 : 0
      );

      const threads = [...svg.querySelectorAll("path.origins-thread")];
      const faces = [...svg.querySelectorAll(".origins-root")];
      const pills = [...svg.querySelectorAll(".origins-node")].map((node) => ({
        id: node.dataset.moment ?? "",
        oval: node.querySelectorAll(".origins-oval")[0],
        hit: node.querySelectorAll(".origins-node-hit")[0],
      }));
      const avatars = [...svg.querySelectorAll(".origins-moment-avatar")];
      const beads = [...svg.querySelectorAll("circle.origins-bead")];
      const ticks = [...svg.querySelectorAll("path.origins-year-tick")];
      const years = [...svg.querySelectorAll("text.origins-year")];

      // For the journey the cards are lifted out of their lists and placed
      // against the layout, which does not move, and each list keeps the room
      // it will need so the page below does not jump. Lifted, a card is no
      // longer cut off by its list, and one standing past the edge of a list
      // that scrolls sideways would widen the page, so the layout cuts it off
      // instead.
      mount!.classList.add("is-morphing");
      layout?.setAttribute("style", "position:relative;overflow-x:clip");
      lists.forEach((list, i) => {
        list.setAttribute("style", `min-height:${rooms[i]}px`);
      });
      for (const text of texts) text.setAttribute("text-anchor", "start");
      // A card shown at neither end is lifted once and left in its list's
      // corner, where it cannot stretch the page as its own place far down
      // or along its list would. A lifted card answers no pointer, here or
      // on its way: one resting where cards pass would light and pick
      // whoever went by.
      items.forEach((item, i) => {
        if (seen0[i] + seen1[i] > 0) return;
        const l = lists1[own[i]];
        item.setAttribute(
          "style",
          `position:absolute;margin:0;opacity:0;pointer-events:none;` +
            `left:${l.x - origin.x}px;top:${l.y - origin.y}px;` +
            `width:${cards1[i].w}px`,
        );
      });

      const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t;
      const paint = (t: number): void => {
        const frame = frameAt(journey, t);
        svg.setAttribute("viewBox", `0 0 ${frame.width} ${frame.height}`);
        const z = lerp(zoom0, zoom1, t);
        svg.setAttribute(
          "style",
          `width:${frame.width * z}px;height:${frame.height * z}px`,
        );
        mount!.setAttribute(
          "style",
          `width:${lerp(box0.w, box1.w, t)}px;` +
            `height:${lerp(box0.h, box1.h, t)}px;max-height:none`,
        );

        for (const path of threads) {
          const d = frame.threads.get(path.dataset.person ?? "");
          if (d !== undefined) path.setAttribute("d", d);
        }
        for (const face of faces) {
          const at = frame.faces.get(face.dataset.person ?? "");
          if (at !== undefined) {
            face.setAttribute("transform", `translate(${at.x} ${at.y})`);
          }
        }
        for (const { id, oval, hit } of pills) {
          const box = frame.boxes.get(id);
          if (box === undefined) continue;
          const end = Math.min(box.width, box.height) / 2;
          for (const [e, grow] of [[oval, 0], [hit, HIT]] as const) {
            if (e === undefined) continue;
            e.setAttribute("x", String(box.x - grow));
            e.setAttribute("y", String(box.y - grow));
            e.setAttribute("width", String(box.width + 2 * grow));
            e.setAttribute("height", String(box.height + 2 * grow));
            e.setAttribute("rx", String(end + grow));
            e.setAttribute("ry", String(end + grow));
          }
        }
        for (const avatar of avatars) {
          const at = frame.avatars.get(avatar.dataset.moment ?? "");
          if (at !== undefined) {
            avatar.setAttribute("transform", `translate(${at.x} ${at.y})`);
          }
        }
        beads.forEach((bead, i) => {
          bead.setAttribute("cx", String(frame.beads[i].x));
          bead.setAttribute("cy", String(frame.beads[i].y));
        });
        texts.forEach((text, i) => {
          text.setAttribute("x", String(frame.labels[i].x));
          text.setAttribute("y", String(frame.labels[i].y));
        });
        ticks.forEach((tick, i) => {
          const { x1, y1, x2, y2 } = frame.ticks[i];
          tick.setAttribute("d", `M${x1},${y1} L${x2},${y2}`);
        });
        years.forEach((text, i) => {
          text.setAttribute("x", String(frame.years[i].x));
          text.setAttribute("y", String(frame.years[i].y));
        });

        // Each card really is the width it looks on the way, so its words
        // wrap as it narrows or widens and nothing in it is stretched. It is
        // at least as tall as the journey says, and taller if its words need
        // it.
        items.forEach((item, i) => {
          if (seen0[i] + seen1[i] === 0) return;
          const a = cards0[i];
          const b = cards1[i];
          const seen = lerp(seen0[i], seen1[i], t);
          item.setAttribute(
            "style",
            `position:absolute;margin:0;pointer-events:none;` +
              `left:${lerp(a.x, b.x, t) - origin.x}px;` +
              `top:${lerp(a.y, b.y, t) - origin.y}px;` +
              `width:${lerp(a.w, b.w, t)}px;` +
              `min-height:${lerp(a.h, b.h, t)}px;opacity:${seen}`,
          );
        });

        // The view slides in a straight line from where it was to where it
        // will be, as everything in it does.
        mount!.scrollLeft = lerp(scroll0.x, scroll1.x, t);
        mount!.scrollTop = lerp(scroll0.y, scroll1.y, t);
      };

      // A frame runs outside this function, so what it throws is handed back
      // here rather than lost with the journey half done.
      await new Promise<void>((done, fail) => {
        let began: number | undefined;
        const step = (now: number): void => {
          try {
            began ??= now;
            const t = Math.min(1, (now - began) / MORPH_MS);
            paint(ease(t));
            if (t < 1) window.requestAnimationFrame(step);
            else done();
          } catch (error) {
            fail(error);
          }
        };
        window.requestAnimationFrame(step);
      });

      // Arrived: the ordinary picture for this mode takes over from the one
      // that was bent into its shape, and nothing the journey set stays.
      tidy();
      mount!.replaceChildren(target, popup);
      shown = to;
      shownAt = width1;
      canvas = { width: to.width, height: to.height };
      zoom = zoom1;
      sizeMap();
      showZoom();
      mount!.scrollLeft = scroll1.x;
      mount!.scrollTop = scroll1.y;
      closePopup();
      wireHover();
      wireKeyboard();
      hovered.clear();
      over = null;
      relight();
      landed = true;
    } catch (error) {
      // Before the page changed mode nothing has moved, and the caller says
      // the switch was lost.
      if (!flipped) throw error;
      console.error("origins: could not move between modes", error);
    } finally {
      morphing = false;
      if (flipped && !landed) {
        // The journey failed, or the two layouts do not pair up: the plain
        // redraw for the mode the page now says it is in, with the view
        // where the journey was taking it.
        tidy();
        await draw(next, carried);
      } else if (landed && mount!.clientWidth !== shownAt) {
        // The window changed size on the way, which the resize handler let
        // pass while the morph ran.
        await draw(next);
      }
    }
  }

  // Lighting a person lights them everywhere: their line and face in the
  // picture, and their card in the roster, in both directions.
  const roster = document.getElementById("origins-roster");

  /** What a click on a card or in the map picked, lit until it is let go. */
  let picked: Pick | null = null;
  /** Everyone lit by hover or focus. */
  const hovered = new Set<string>();
  /** The moment whose card in the list is under the pointer. */
  let hot: string | null = null;
  /** The moment under the pointer in the map. */
  let over: string | null = null;

  /**
   * Set what is lit, outlined and picked, in the map and in the lists, from
   * the four above. The only place those classes are set: hover and a pick
   * light the same people, and either ending must leave what the other lit.
   */
  function relight(): void {
    const lit = new Set([...hovered, ...litBy(story, picked)]);
    const person = picked?.kind === "person" ? picked.id : undefined;
    const moment = picked?.kind === "moment" ? picked.id : undefined;
    for (const node of mount!.querySelectorAll("[data-person]")) {
      node.classList.toggle("is-lit", lit.has(node.dataset.person ?? ""));
    }
    for (const pill of mount!.querySelectorAll(".origins-node")) {
      pill.classList.toggle("is-hot", pill.dataset.moment === hot);
      pill.classList.toggle("is-picked", pill.dataset.moment === moment);
    }
    if (roster === null) return;
    for (const card of roster.querySelectorAll("[data-person]")) {
      card.classList.toggle("is-lit", lit.has(card.dataset.person ?? ""));
      card.classList.toggle("is-picked", card.dataset.person === person);
    }
    for (const card of roster.querySelectorAll(".origins-detail-card")) {
      const id = card.dataset.moment;
      card.classList.toggle("is-lit", id === over || id === hot);
      card.classList.toggle("is-picked", id === moment);
    }
  }

  function highlight(slug: string | undefined, on: boolean): void {
    if (slug === undefined) return;
    if (on) hovered.add(slug);
    else hovered.delete(slug);
    relight();
  }

  /**
   * Scroll the map so what a card in a list picked is in its middle, or as
   * near as the map goes. With no picture there is nothing to scroll to, and
   * the card is picked all the same.
   */
  function centreOn(pick: Pick): void {
    const thing = mount!.querySelectorAll(
      pick.kind === "person"
        ? `.origins-root[data-person="${pick.id}"]`
        : `.origins-node[data-moment="${pick.id}"] .origins-oval`,
    )[0];
    if (thing === undefined) return;
    // First: finding the reach puts the map back where it was, which stops
    // a smooth scroll that is under way, and the boxes below are read from
    // where it stopped.
    const reach = reachOf();
    const map = mount!.getBoundingClientRect();
    const at = thing.getBoundingClientRect();
    const to = centred(
      {
        x: at.left - map.left + mount!.scrollLeft + at.width / 2,
        y: at.top - map.top + mount!.scrollTop + at.height / 2,
      },
      { width: mount!.clientWidth, height: mount!.clientHeight },
      reach,
    );
    mount!.scrollTo({
      left: to.x,
      top: to.y,
      behavior: window!.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }

  /**
   * Pick what was clicked in the map and glide its list until its card is in
   * the middle of the list's box, or as near as the list goes: a card
   * brought only as far as the box's edge is easy to miss there. The list's
   * own scrollTo, not scrollIntoView, which would scroll the page and the
   * map as well. At once for a reader who asks for less motion.
   */
  function pickInMap(pick: Pick): PageElement | undefined {
    picked = pick;
    relight();
    const card = roster?.querySelectorAll(
      pick.kind === "person"
        ? `.origins-card[data-person="${pick.id}"]`
        : `.origins-detail-card[data-moment="${pick.id}"]`,
    )[0];
    if (card === undefined) return undefined;
    const list = card.closest(".origins-roster, .origins-moments")!;
    const c = card.getBoundingClientRect();
    const l = list.getBoundingClientRect();
    const to = framed(
      {
        x: c.left - l.left + list.scrollLeft,
        y: c.top - l.top + list.scrollTop,
        width: c.width,
        height: c.height,
      },
      { width: list.clientWidth, height: list.clientHeight },
      {
        x: list.scrollWidth - list.clientWidth,
        y: list.scrollHeight - list.clientHeight,
      },
    );
    list.scrollTo({
      left: to.x,
      top: to.y,
      behavior: window!.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    return card;
  }

  /**
   * The lists are beside the map rather than under it. Read from where they
   * are each time it is asked: the window can be resized and the mode
   * switched between one click and the next.
   */
  function beside(): boolean {
    if (roster === null) return false;
    const map = mount!.getBoundingClientRect();
    return roster.getBoundingClientRect().left >= map.left + map.width;
  }

  /**
   * Beside the map the list's card says all the popup would, so what was
   * clicked is picked and its list glides to it, and nothing opens. From
   * the keyboard focus goes on to the card, as it would have gone into the
   * popup, without scrolling anything: the list is already gliding there.
   */
  function showInList(pick: Pick, byKeyboard: boolean): void {
    const card = pickInMap(pick);
    if (!byKeyboard || card === undefined) return;
    card.setAttribute("tabindex", "-1");
    card.focus({ preventScroll: true });
    sentTo = card;
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
    const gathering = story.moments.find((m) => m.moment.id === id);
    if (gathering === undefined) return;
    if (beside()) {
      showInList({ kind: "moment", id }, byKeyboard);
      return;
    }
    openPopup(anchor, detailFor(gathering, cast, document), byKeyboard);
    markOpen(id);
    pickInMap({ kind: "moment", id });
  }

  function showPerson(
    slug: string | undefined,
    anchor: PageElement,
    byKeyboard = false,
  ): void {
    if (slug === undefined) return;
    const thread = story.threads.find((t) => t.person.slug === slug);
    if (thread === undefined) return;
    if (beside()) {
      showInList({ kind: "person", id: slug }, byKeyboard);
      return;
    }
    openPopup(anchor, personCardFor(thread, story, document), byKeyboard);
    markOpen(undefined);
    pickInMap({ kind: "person", id: slug });
  }

  // --- the roving tabindex ---------------------------------------------------
  // The picture is one tab stop. The arrow keys move the cursor through the
  // story, and only the target under it is tabbable, so tabbing past the
  // braid takes one press rather than forty-six.

  const order = focusOrder(story);
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
          // A card opened while a morph runs would open beside a picture
          // that is about to be replaced.
          if (!morphing) openAt(cursor, true);
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

    // Hovering a moment lights the threads of everyone through it who was not
    // away; clicking it opens the card. Hover is for "who was in this", click
    // is for "tell me about it", which is the part worth dwelling on.
    for (const node of mount!.querySelectorAll("[data-moment]")) {
      const id = node.dataset.moment;
      const gathering = story.moments.find((m) => m.moment.id === id);
      if (gathering === undefined) continue;
      const who = gathering.through.filter((p) => !p.away).map((p) => p.slug);
      node.addEventListener("pointerenter", (e) => {
        if (!hovers(e)) return;
        for (const slug of who) hovered.add(slug);
        over = gathering.moment.id;
        relight();
      });
      node.addEventListener("pointerleave", () => {
        for (const slug of who) hovered.delete(slug);
        over = null;
        relight();
      });
      // A moment's avatar carries its moment's id too, and a click on it is a
      // click on the moment: the card opens beside the oval either way, and
      // not on top of the moment's own name.
      const oval = mount!.querySelectorAll(`.origins-node[data-moment="${id}"]`)[0] ?? node;
      node.addEventListener("click", () => showMoment(id, oval));
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
  // own buttons and links handle themselves. Only in the map: a moment's
  // card in the list carries its moment's id too, and closes the card as a
  // person's card there does.
  //
  // A click on empty map lets go of the pick, whether or not a card is open.
  // The click that ends a drag of the map never gets here, so a drag lets go
  // of nothing.
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (
      target !== null && mount.contains(target) && !popup.contains(target) &&
      target.closest("[data-moment], .origins-root") === null
    ) {
      picked = null;
      relight();
    }
    if (popup.hidden) return;
    if (target === null || popup.contains(target)) return;
    if (mount.contains(target.closest("[data-moment], .origins-root"))) return;
    closePopup();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closePopup();
    picked = null;
    relight();
    // Back to the map from the card the keyboard sent focus to, to the target
    // the map's cursor is on, which is the one Enter was pressed on or what a
    // redraw put in its place. Only while focus is still on that card: a
    // reader who has gone somewhere else since keeps the place they chose.
    if (sentTo !== null && sentTo.contains(document.activeElement)) {
      elementAt(cursor)?.focus({ preventScroll: true });
    }
    sentTo = null;
  });

  if (roster !== null) {
    roster.replaceChildren(...listsFor(story, cast, document));
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
      // A click picks the person, or lets go of them if they were picked
      // already. Not a click on one of the card's links, which is for the
      // link. The second click of a double click is not one either: it let
      // go of what the first had just picked.
      card.addEventListener("click", (event) => {
        if (morphing || (event.detail ?? 0) > 1 || event.target!.closest("a") !== null) return;
        picked = toggled(picked, { kind: "person", id: card.dataset.person ?? "" });
        relight();
        if (picked !== null) centreOn(picked);
      });
    }

    // A moment's card lights what hovering its moment in the map lights, and
    // outlines the moment there so the reader can find it. Found by its own
    // id, as the map's moments are.
    for (const card of roster.querySelectorAll(".origins-detail-card")) {
      const gathering = story.moments.find((m) => m.moment.id === card.dataset.moment)!;
      const id = gathering.moment.id;
      const who = gathering.through.filter((p) => !p.away).map((p) => p.slug);
      card.addEventListener("pointerenter", (event) => {
        if (!hovers(event)) return;
        for (const slug of who) hovered.add(slug);
        hot = id;
        relight();
      });
      card.addEventListener("pointerleave", () => {
        for (const slug of who) hovered.delete(slug);
        hot = null;
        relight();
      });
      card.addEventListener("click", (event) => {
        // As a person's card: a double click is one click, and a click on one
        // of the card's links is for the link.
        if (morphing || (event.detail ?? 0) > 1 || event.target!.closest("a") !== null) return;
        picked = toggled(picked, { kind: "moment", id });
        relight();
        if (picked !== null) centreOn(picked);
      });
    }
  }

  // --- zoom ---------------------------------------------------------------------
  // The map zooms by resizing the picture inside its scrolling box, not by
  // moving a camera over it, so the wheel, a finger and the scrollbars all go
  // on working at any zoom, and a card still opens beside what was clicked.

  const picture = (): PageElement | undefined =>
    mount!.querySelectorAll(".origins-svg")[0];

  function sizeMap(): void {
    picture()?.setAttribute(
      "style",
      `width:${canvas.width * zoom}px;height:${canvas.height * zoom}px`,
    );
  }

  const zoomButtons = document.getElementById("origins-zoom");

  /** Mark the buttons that would do nothing at this zoom. */
  function showZoom(): void {
    if (zoomButtons === null) return;
    for (const button of zoomButtons.querySelectorAll("[data-origins-zoom]")) {
      const does = button.dataset.originsZoom;
      // Not `disabled`: a button that disables itself under the keyboard
      // drops the focus that was on it.
      button.setAttribute(
        "aria-disabled",
        String(
          (does === "in" && zoom === ZOOM_MAX) ||
            (does === "out" && zoom === ZOOM_MIN) ||
            (does === "reset" && zoom === 1),
        ),
      );
    }
  }

  /**
   * Zoom to `next`, holding still whatever is at `still`, a point on screen:
   * the pointer for a wheel, the middle of the box for a button.
   */
  function zoomTo(next: number, still?: { x: number; y: number }): void {
    const svg = picture();
    if (svg === undefined || next === zoom) return;
    const box = mount!.getBoundingClientRect();
    const at = still ?? {
      x: box.left + mount!.clientWidth / 2,
      y: box.top + mount!.clientHeight / 2,
    };
    // Where that point is on the picture, as a fraction of it, and where the
    // same fraction of the resized picture has landed.
    const before = svg.getBoundingClientRect();
    const across = (at.x - before.left) / before.width;
    const down = (at.y - before.top) / before.height;
    zoom = next;
    sizeMap();
    const after = svg.getBoundingClientRect();
    mount!.scrollLeft += after.left + across * after.width - at.x;
    mount!.scrollTop += after.top + down * after.height - at.y;
    // The card was placed beside something that has just moved.
    closePopup();
    showZoom();
  }

  if (zoomButtons !== null) {
    for (const button of zoomButtons.querySelectorAll("[data-origins-zoom]")) {
      button.addEventListener("click", (event) => {
        // While a morph runs the picture is between two sizes.
        if (morphing) return;
        const does = event.currentTarget.dataset.originsZoom;
        fitted = does === "fit";
        if (does === "in") zoomTo(stepZoom(zoom, 1));
        else if (does === "out") zoomTo(stepZoom(zoom, -1));
        else if (does === "reset") zoomTo(1);
        else if (does === "fit") {
          // The box is as tall as its picture up to a ceiling, so the room
          // there is to fit into is the ceiling and not the box as it stands.
          zoomTo(fitZoom(canvas, {
            width: mount!.clientWidth,
            height: parseFloat(getComputedStyle(mount!).maxHeight),
          }));
        }
      });
    }
    showZoom();
  }

  // The plain wheel scrolls the map and then the page, as it always has.
  // Held with Ctrl it zooms about the pointer, which is also how a pinch on a
  // trackpad arrives. Not passive: the browser's own zoom has to be refused.
  mount.addEventListener("wheel", (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    fitted = false;
    zoomTo(wheelZoom(zoom, event.deltaY, event.deltaMode), {
      x: event.clientX,
      y: event.clientY,
    });
  }, { passive: false });

  // --- grab -----------------------------------------------------------------------
  // A mouse can take hold of the map and move it. A finger already could:
  // the box pans natively under one, with momentum, and is left to.

  let grab:
    | { x: number; y: number; left: number; top: number; pointer: number }
    | null = null;
  /** The press under way has moved far enough to be a drag. */
  let grabbing = false;
  /** The last press ended as a drag, so the click it ends with is not one. */
  let dragged = false;

  function letGo(): void {
    grab = null;
    if (!grabbing) return;
    grabbing = false;
    mount!.classList.remove("is-grabbing");
  }

  mount.addEventListener("pointerdown", (event) => {
    dragged = false;
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    // Not from inside the card, whose text is there to be selected.
    if (popup.contains(event.target)) return;
    // Not from the box's own scrollbars, which are outside its client area.
    const box = mount.getBoundingClientRect();
    if (
      event.clientX - box.left >= mount.clientWidth ||
      event.clientY - box.top >= mount.clientHeight
    ) return;
    grab = {
      x: event.clientX,
      y: event.clientY,
      left: mount.scrollLeft,
      top: mount.scrollTop,
      pointer: event.pointerId,
    };
  });
  mount.addEventListener("pointermove", (event) => {
    if (grab === null) return;
    // Let go somewhere the box never heard about.
    if ((event.buttons & 1) === 0) {
      letGo();
      return;
    }
    const dx = event.clientX - grab.x;
    const dy = event.clientY - grab.y;
    if (!grabbing) {
      if (Math.hypot(dx, dy) < GRAB_SLOP) return;
      grabbing = true;
      dragged = true;
      // Only now, not on the press: a captured pointer's click goes to the
      // box, and a press that stays put is a click meant for a moment.
      mount.setPointerCapture(grab.pointer);
      mount.classList.add("is-grabbing");
    }
    mount.scrollLeft = grab.left - dx;
    mount.scrollTop = grab.top - dy;
  });
  mount.addEventListener("pointerup", letGo);
  mount.addEventListener("pointercancel", letGo);
  // The click a drag ends with would open whatever it was let go over, and
  // close the card that was open. Stopped on the way down, before either. A
  // click made by the keyboard has no press before it to clear the flag, so
  // it is never taken for the end of a drag.
  mount.addEventListener("click", (event) => {
    const endsDrag = dragged && event.detail !== 0;
    dragged = false;
    if (endsDrag) event.stopPropagation();
  }, true);

  // The canvas is sized to its box, so a resized window needs a redraw. It
  // needs no new layout though, only re-centring, which is why this can run
  // on a drag at all. Settle first: a drag fires continuously, and the width
  // that matters is the one it stops at.
  if (window !== undefined) {
    let settling = 0;
    window.addEventListener("resize", () => {
      window.clearTimeout(settling);
      settling = window.setTimeout(() => {
        // A morph that is running checks the width when it lands.
        if (morphing || mount!.clientWidth === shownAt) return;
        void draw(mode);
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
        if (next === mode || morphing) return;
        mode = next;
        writeMode(store, mode);
        morph(mode).catch((error: unknown) => {
          // The picture already on screen stays; only the switch is lost.
          console.error("origins: could not switch mode", error);
        });
        showMode();
      });
    }
    showMode();
  }

  draw(mode, OPENING).then(() => {
    // Shown once there is a picture to switch, so a reader whose layout
    // engine never arrived is not offered a control that does nothing. The
    // zoom and the legend go with it: there is nothing to zoom, and the
    // legend explains marks that are not there without a picture.
    buttons?.classList.remove("is-hidden");
    zoomButtons?.classList.remove("is-hidden");
    document.getElementById("origins-legend")?.classList.remove("is-hidden");
    // Lay the other mode out once the page has settled, so the first switch
    // can start moving at once. A switch pressed sooner waits for this same
    // layout, and one that fails here is tried again by the switch.
    window?.setTimeout(() => {
      layoutOf(mode === "river" ? "subway" : "river").catch(() => {});
    }, OTHER_MODE_AFTER_MS);
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
