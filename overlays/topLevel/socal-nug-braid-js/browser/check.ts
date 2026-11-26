import { LABEL_MAX } from "../src/elk.ts";
import { parseData } from "../src/parse.ts";
import { buildStory } from "../src/story.ts";
import type { Story } from "../src/story.ts";
import { launch, sleep } from "./cdp.ts";
import { serve } from "./serve.ts";

/**
 * What the Origins page has to do in a real browser.
 *
 * Everything else that checks this page checks its data, its layout or its
 * markup. None of it scrolls, clicks, tabs, taps or resizes, and every
 * defect this was written from was one of those: a wheel that stopped at
 * the bottom of the map, a card that dragged the page back when dismissed,
 * a toggle that never showed which mode was on.
 *
 * Run on demand, not by `nix flake check`:
 *
 *     nix run .#socal-nug-braid-browser
 *
 * after changing `src/main.ts`, `sass/css/pages/origins.scss` or
 * `templates/origins.html`. Those are the only places these behaviours can
 * break; an event, a moment or a profile cannot break any of them, which is
 * why content changes are not made to pay for a browser in CI.
 *
 * Each check is named for what a visitor would notice if it failed, and
 * none names a moment or a person, so the data can change under it. It
 * needs the network: Bulma and the fonts come from CDNs, and two checks
 * read colours that Bulma supplies.
 */

declare const process: {
  argv: string[];
  exit(code: number): never;
};

const site = process.argv[2];
if (site === undefined) {
  console.error("usage: check <built site directory>");
  process.exit(2);
}

const server = await serve(site);
const browser = await launch();
const tab = await browser.tab();
const page = `${server.origin}/origins/`;

const results: Array<{ ok: boolean; name: string; detail: string }> = [];
function check(ok: boolean, name: string, detail: unknown = ""): void {
  results.push({
    ok,
    name,
    detail: typeof detail === "string" ? detail : JSON.stringify(detail),
  });
}

interface Point {
  x: number;
  y: number;
}

const MAP = `document.getElementById("origins-braid")`;
const ROSTER = `document.getElementById("origins-roster")`;
const PEOPLE = `${ROSTER}.querySelector(".origins-roster")`;
const MOMENTS = `${ROSTER}.querySelector(".origins-moments")`;
const POPUP = `document.querySelector(".origins-popup")`;
/** A dot off the spine: a personal moment, a conference, a camp. */
const SIDE_DOT = ".origins-node.is-side";

/** Open the page in one mode at one size, and wait for the picture. */
async function load(
  mode: "river" | "subway",
  width = 1400,
  height = 1000,
  phone = false,
): Promise<void> {
  await tab.size(width, height, phone);
  // once to have somewhere to store the mode, once to boot in it
  await tab.goto(page);
  await tab.evaluate(`localStorage.setItem("origins-mode", "${mode}")`);
  await tab.goto(page);
  const drawn = await tab.waitFor(
    `document.querySelector("#origins-braid svg.is-${mode}") !== null`,
    15_000,
  );
  if (!drawn) throw new Error(`the ${mode} picture never appeared`);
  // text is measured below, and it is not the same width before its font
  await tab.evaluate(`document.fonts.ready.then(() => true)`);
}

/** The middle of the first element matching, scrolled into view. */
const centreOf = (selector: string): Promise<Point> =>
  tab.evaluate(`(() => {
    const e = document.querySelector(${JSON.stringify(selector)});
    e.scrollIntoView({ block: "center", inline: "center" });
    const b = e.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  })()`);

/** A point inside the map's box, a fraction of the way down it. */
const insideMap = (down: number): Promise<Point> =>
  tab.evaluate(`(() => {
    const b = ${MAP}.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height * ${down} };
  })()`);

const scrolled = (): Promise<{ page: number; map: number }> =>
  tab.evaluate(
    `({ page: Math.round(scrollY), map: Math.round(${MAP}.scrollTop) })`,
  );

/** Where the page, the map and the list of people are scrolled to, unrounded, as one string. */
const scrollState = `(scrollY + "," + ${MAP}.scrollTop + "," + ${PEOPLE}.scrollTop)`;

/**
 * Repeat a gesture inside the map or the roster, as a visitor would, until
 * the page itself has moved. After each gesture, wait for the box or the page
 * to move and then to come to rest. A gesture that moves nothing is a stall.
 */
async function untilThePageMoves(
  gesture: () => Promise<void>,
): Promise<{ ok: boolean; detail: Record<string, unknown> }> {
  const start = await scrolled();
  for (let gestures = 1; gestures <= 40; gestures += 1) {
    const before = await tab.evaluate<string>(scrollState);
    await gesture();
    const moved = await tab.waitFor(`${scrollState} !== ${JSON.stringify(before)}`);
    if (!moved) {
      return { ok: false, detail: { stalledOn: gestures, ...(await scrolled()) } };
    }
    // At rest: the same place on two polls in a row.
    await tab.waitFor(`(() => {
      const now = ${scrollState};
      const same = now === window.__originsLastScroll;
      window.__originsLastScroll = now;
      return same;
    })()`);
    const now = await scrolled();
    if (now.page !== start.page) {
      return { ok: true, detail: { gestures, ...now } };
    }
  }
  return { ok: false, detail: { gestures: 40, pageNeverMoved: true, ...(await scrolled()) } };
}

const popupOpen = `${POPUP} !== null && !${POPUP}.hidden`;
const popupShut = `${POPUP}.hidden`;

const PICTURE = `document.querySelector("#origins-braid svg")`;
/** How wide the picture is on screen, which is what zooming changes. */
const pictureWidth = `${PICTURE}.getBoundingClientRect().width`;
/** How wide the layout drew it, which zooming leaves alone. */
const drawnWidth = `Number(${PICTURE}.getAttribute("width"))`;

/** Which point of the picture is at a point on screen, as fractions of it. */
const onPicture = (at: Point): Promise<Point & { width: number; height: number }> =>
  tab.evaluate(`(() => {
    const b = ${PICTURE}.getBoundingClientRect();
    return {
      x: (${at.x} - b.left) / b.width,
      y: (${at.y} - b.top) / b.height,
      width: b.width,
      height: b.height,
    };
  })()`);

/** How far, in pixels on screen, the picture slid under a point that should have held it. */
const slid = (
  before: Point,
  after: Point & { width: number; height: number },
): number =>
  Math.max(
    Math.abs(after.x - before.x) * after.width,
    Math.abs(after.y - before.y) * after.height,
  );

const zoomButton = (does: string): Promise<Point> =>
  centreOf(`[data-origins-zoom="${does}"]`);

/**
 * A point on the map and on screen with nothing under it but the picture's
 * background, at least `down` pixels below the top of the map's box.
 */
const emptyMap = (down: number): Promise<Point | null> =>
  tab.evaluate(`(() => {
    const b = ${MAP}.getBoundingClientRect();
    const floor = Math.min(b.bottom, innerHeight) - 20;
    for (let y = Math.max(b.top, 0) + ${down}; y < floor; y += 15) {
      for (let x = b.left + 20; x < b.left + ${MAP}.clientWidth - 20; x += 15) {
        const e = document.elementFromPoint(x, y);
        if (e !== null && e.matches(".origins-svg")) return { x, y };
      }
    }
    return null;
  })()`);

const mapAt = (): Promise<{ left: number; top: number }> =>
  tab.evaluate(`({ left: ${MAP}.scrollLeft, top: ${MAP}.scrollTop })`);

const MORPHING = `${MAP}.classList.contains("is-morphing")`;

/** Press a mode's button, as a visitor would. */
async function pressMode(mode: "river" | "subway"): Promise<void> {
  const at = await centreOf(`[data-origins-mode="${mode}"]`);
  await tab.click(at.x, at.y);
}

/** Wait until the map shows a mode and has stopped moving. */
const landedIn = (mode: "river" | "subway"): Promise<boolean> =>
  tab.waitFor(`${PICTURE}.classList.contains("is-${mode}") && !${MORPHING}`, 15_000);

/** From now on, note whether the map ever starts moving between modes. */
const watchForMorph = (): Promise<boolean> =>
  tab.evaluate(`(() => {
    window.__originsMorphed = false;
    new MutationObserver(() => {
      if (${MORPHING}) window.__originsMorphed = true;
    }).observe(${MAP}, { attributes: true, attributeFilter: ["class"] });
    return true;
  })()`);
const morphed = (): Promise<boolean> => tab.evaluate(`window.__originsMorphed === true`);

/** The picture as markup, without the inline size the zoom gives it. */
const shape = (): Promise<string> =>
  tab.evaluate(`(() => {
    const svg = ${PICTURE}.cloneNode(true);
    svg.removeAttribute("style");
    return svg.outerHTML;
  })()`);

/**
 * How far the map's box can scroll, found by asking it to go too far and
 * reading back where it stopped. The sizes it reports count the room kept for
 * a scrollbar, which cannot be scrolled into.
 */
const reach = (): Promise<Point> =>
  tab.evaluate(`(() => {
    const m = ${MAP};
    const at = [m.scrollLeft, m.scrollTop];
    m.scrollLeft = 1e7;
    m.scrollTop = 1e7;
    const r = { x: m.scrollLeft, y: m.scrollTop };
    m.scrollLeft = at[0];
    m.scrollTop = at[1];
    return r;
  })()`);

/**
 * Whatever a switch has left set on the box, the layout, either list, their
 * headings or their cards, and any card that is not back in its own list.
 */
const leftBehind = (): Promise<string[]> =>
  tab.evaluate(`(() => {
    const out = [];
    const layout = document.getElementById("origins-layout");
    const lists = [
      ["people", ${PEOPLE}, ".origins-roster-item", ".origins-card"],
      ["moments", ${MOMENTS}, ".origins-moments-item", ".origins-detail-card"],
    ];
    for (const [name, e] of [["box", ${MAP}], ["layout", layout], ...lists]) {
      if (e === null) out.push(name + " is missing");
      else if (e.hasAttribute("style")) out.push(name + " has a style");
    }
    const headings = [...${ROSTER}.querySelectorAll(".origins-pane-title")];
    if (headings.length !== 2) out.push(headings.length + " headings");
    headings.forEach((h, i) => {
      if (h.hasAttribute("style")) out.push("heading " + i + " has a style");
    });
    for (const [name, list, items, cards] of lists) {
      if (list === null) continue;
      const box = list.getBoundingClientRect();
      [...${ROSTER}.querySelectorAll(items)].forEach((item, i) => {
        const card = item.querySelector(cards);
        const b = item.getBoundingClientRect();
        if (item.hasAttribute("style") || (card !== null && card.hasAttribute("style"))) {
          out.push(name + " card " + i + " has a style");
        }
        if (getComputedStyle(item).position !== "static" || item.parentElement !== list) {
          out.push(name + " card " + i + " is out of its list");
        }
        if (b.left < box.left - 1 || b.right > box.right + 1) {
          out.push(name + " card " + i + " is outside its list");
        }
      });
    }
    return out;
  })()`);

/** Who is in the list of people and what is in the list of moments, in order. */
const listOrder = (): Promise<string> =>
  tab.evaluate(`[
    ...[...${ROSTER}.querySelectorAll(".origins-card")].map((c) => c.dataset.person),
    "|",
    ...[...${ROSTER}.querySelectorAll(".origins-detail-card")].map((c) => c.dataset.moment),
  ].join(" ")`);

/** The story the page tells, from the data in the page. */
async function storyOf(): Promise<Story> {
  const data = parseData(JSON.parse(
    await tab.evaluate<string>(`document.getElementById("origins-data").textContent`),
  ));
  return buildStory(data.moments, data.people);
}

/** Everyone confirmed at a moment, by slug, in order: who it lights. */
const cameTo = (story: Story, id: string): string[] =>
  [
    ...new Set(
      (story.moments.find((g) => g.moment.id === id)?.through ?? [])
        .filter((p) => p.vouched)
        .map((p) => p.slug),
    ),
  ].sort();

/** The moments someone is confirmed at. */
const peopled = (story: Story): string[] =>
  story.moments.filter((g) => g.through.some((p) => p.vouched)).map((g) => g.moment.id);

const FACE = (slug: string) => `#origins-braid .origins-root[data-person="${slug}"]`;
const OVAL = (id: string) => `#origins-braid .origins-node[data-moment="${id}"] .origins-oval`;
const PILL = (id: string) => `#origins-braid .origins-node[data-moment="${id}"]`;
const PERSON_CARD = (slug: string) => `#origins-roster .origins-card[data-person="${slug}"]`;
const MOMENT_CARD = (id: string) => `#origins-roster .origins-detail-card[data-moment="${id}"]`;

/** Whose threads are lit in the map, in order. */
const LIT_PEOPLE =
  `[...new Set([...${MAP}.querySelectorAll("path.origins-thread.is-lit")].map((p) => p.dataset.person))].sort()`;

/** Whether the first element matching has a class. */
const has = (selector: string, name: string): string =>
  `(document.querySelector(${JSON.stringify(selector)})?.classList.contains(${
    JSON.stringify(name)
  }) ?? false)`;

/**
 * A point on a card in the lists that is not on a link, with the card
 * scrolled into view first.
 */
const onCard = (selector: string): Promise<Point | null> =>
  tab.evaluate(`(() => {
    const c = document.querySelector(${JSON.stringify(selector)});
    if (c === null) return null;
    c.scrollIntoView({ block: "center", inline: "center" });
    const b = c.getBoundingClientRect();
    for (let y = b.top + 4; y < b.bottom - 2; y += 4) {
      for (let x = b.left + 4; x < b.right - 2; x += 4) {
        const e = document.elementFromPoint(x, y);
        if (e !== null && c.contains(e) && e.closest("a") === null) return { x, y };
      }
    }
    return null;
  })()`);

/** Click a card in the lists somewhere that is not a link. Whether there was such a place. */
async function clickCard(selector: string): Promise<boolean> {
  const at = await onCard(selector);
  if (at === null) return false;
  await tab.click(at.x, at.y);
  return true;
}

/**
 * Of these things in the map, keyed by id, the one whose middle is furthest
 * from the middle of the map's box, and how far that is.
 */
const furthest = (selectors: Record<string, string>): Promise<{ id: string; off: number } | null> =>
  tab.evaluate(`(() => {
    const m = ${MAP};
    const b = m.getBoundingClientRect();
    let best = null;
    for (const [id, selector] of Object.entries(${JSON.stringify(selectors)})) {
      const e = document.querySelector(selector);
      if (e === null) continue;
      const c = e.getBoundingClientRect();
      const off = Math.hypot(
        c.left + c.width / 2 - b.left - m.clientWidth / 2,
        c.top + c.height / 2 - b.top - m.clientHeight / 2,
      );
      if (best === null || off > best.off) best = { id, off };
    }
    return best;
  })()`);

/** Wait for a smooth scroll of the map to end: the same place 200ms apart. */
async function mapSettles(): Promise<void> {
  let was = await mapAt();
  for (let waited = 0; waited < 5000; waited += 200) {
    await sleep(200);
    const is = await mapAt();
    if (is.left === was.left && is.top === was.top) return;
    was = is;
  }
}

/**
 * Whether the middle of the first element matching is in the middle of the
 * map's box, within 2px, on each axis, or the map has gone as far towards it
 * as it can on that axis.
 */
const centredIn = (selector: string): Promise<{ ok: boolean } & Record<string, unknown>> =>
  tab.evaluate(`(() => {
    const m = ${MAP};
    const e = document.querySelector(${JSON.stringify(selector)});
    if (e === null) return { ok: false, missing: true };
    const b = m.getBoundingClientRect();
    const c = e.getBoundingClientRect();
    const off = {
      x: c.left + c.width / 2 - b.left - m.clientWidth / 2,
      y: c.top + c.height / 2 - b.top - m.clientHeight / 2,
    };
    const at = { x: m.scrollLeft, y: m.scrollTop };
    m.scrollLeft = 1e7;
    m.scrollTop = 1e7;
    const reach = { x: m.scrollLeft, y: m.scrollTop };
    m.scrollLeft = at.x;
    m.scrollTop = at.y;
    const there = (o, now, most) =>
      Math.abs(o) <= 2 || (o < 0 && now <= 1) || (o > 0 && now >= most - 1);
    return { ok: there(off.x, at.x, reach.x) && there(off.y, at.y, reach.y), off, at, reach };
  })()`);

/** Wait for a smooth scroll of a list to end: the same place 200ms apart. */
async function listSettles(list: string): Promise<void> {
  const at = `[${list}.scrollLeft, ${list}.scrollTop].join()`;
  let was = await tab.evaluate<string>(at);
  for (let waited = 0; waited < 5000; waited += 200) {
    await sleep(200);
    const is = await tab.evaluate<string>(at);
    if (is === was) return;
    was = is;
  }
}

/**
 * Whether the middle of a card is in the middle of its list's box, within
 * 2px, on each axis, or the list has gone as far towards it as it can on
 * that axis.
 */
const midList = (card: string, list: string): Promise<{ ok: boolean } & Record<string, unknown>> =>
  tab.evaluate(`(() => {
    const l = ${list};
    const c = document.querySelector(${JSON.stringify(card)});
    if (c === null) return { ok: false, missing: true };
    const b = l.getBoundingClientRect();
    const r = c.getBoundingClientRect();
    const off = {
      x: r.left + r.width / 2 - b.left - l.clientWidth / 2,
      y: r.top + r.height / 2 - b.top - l.clientHeight / 2,
    };
    const at = { x: l.scrollLeft, y: l.scrollTop };
    const reach = { x: l.scrollWidth - l.clientWidth, y: l.scrollHeight - l.clientHeight };
    const there = (o, now, most) =>
      Math.abs(o) <= 2 || (o < 0 && now <= 1) || (o > 0 && now >= most - 1);
    return { ok: there(off.x, at.x, reach.x) && there(off.y, at.y, reach.y), off, at, reach };
  })()`);

/**
 * A moment whose card is past the end of its list's box once the list is
 * back at its start, so the list has somewhere to go to show it.
 */
const momentPastItsList = (): Promise<string | null> =>
  tab.evaluate(`(() => {
    const list = ${MOMENTS};
    list.scrollTop = 0;
    list.scrollLeft = 0;
    const l = list.getBoundingClientRect();
    const out = [...list.querySelectorAll(".origins-detail-card")]
      .find((c) => c.getBoundingClientRect().top >= l.bottom);
    return out?.dataset.moment ?? null;
  })()`);

/** Every check, in the order a failure is easiest to read. */
async function run(): Promise<void> {
  // --- scrolling past the map ---------------------------------------------------

  // The map's end is reached the way a visitor reaches it. A scripted jump to
  // scrollHeight can land a fraction of a pixel past the real end of a box
  // whose extent is not a whole pixel, and the next gesture is then spent
  // coming back, which no visitor can cause.
  await load("river");
  {
    const at = await insideMap(0.5);
    const { ok, detail } = await untilThePageMoves(() => tab.wheel(at.x, at.y, 300));
    check(
      ok,
      "River: the wheel never stalls inside the map, and carries on down the page at its end",
      detail,
    );
  }

  await load("subway");
  {
    const at = await insideMap(0.5);
    await tab.wheel(at.x, at.y, 300);
    check(
      await tab.waitFor(`scrollY > 0`),
      "Subway: the wheel over the map scrolls the page",
      await scrolled(),
    );
  }

  await load("river", 390, 844, true);
  {
    await tab.evaluate(`${MAP}.scrollIntoView({ block: "center" })`);
    const from = await insideMap(0.75);
    const to = await insideMap(0.25);
    const { ok, detail } = await untilThePageMoves(() => tab.drag(from.x, from.y, to.y));
    check(
      ok,
      "phone: a finger never stalls inside the map, and scrolls the page once the map is at its end",
      detail,
    );
  }

  // --- the roster beside the map ---------------------------------------------------
  // Beside the map it is a box of its own that ends where the map ends. How
  // many people there are decides whether it has anything to scroll, so a
  // roster that fits passes these without being asked to.

  await load("river");
  {
    const sizes = await tab.evaluate<
      { map: number; roster: number; content: number; box: number }
    >(`({
      map: ${MAP}.getBoundingClientRect().height,
      roster: ${ROSTER}.getBoundingClientRect().height,
      content: ${ROSTER}.scrollHeight,
      box: ${ROSTER}.clientHeight,
    })`);
    const more = sizes.content > sizes.box;
    check(
      sizes.roster <= sizes.map + 1 && (!more || Math.abs(sizes.roster - sizes.map) <= 1),
      "River: the roster beside the map is no taller than the map, and ends where the map ends when it has more to show",
      sizes,
    );

    const lists = await tab.evaluate<Record<string, unknown> | null>(`(() => {
      const people = ${PEOPLE};
      const moments = ${MOMENTS};
      if (people === null || moments === null) return null;
      const rail = ${ROSTER}.getBoundingClientRect();
      const p = people.getBoundingClientRect();
      const m = moments.getBoundingClientRect();
      return {
        below: m.top >= p.bottom,
        inside: m.top >= rail.top - 1 && m.bottom <= rail.bottom + 1 &&
          m.left >= rail.left - 1 && m.right <= rail.right + 1,
        overflow: [getComputedStyle(people).overflowY, getComputedStyle(moments).overflowY],
        more: moments.scrollHeight > moments.clientHeight,
        cards: moments.querySelectorAll(".origins-detail-card").length,
        nodes: ${MAP}.querySelectorAll(".origins-node").length,
      };
    })()`);
    check(
      lists !== null && lists.below === true && lists.inside === true &&
        JSON.stringify(lists.overflow) === `["auto","auto"]` && lists.more === true &&
        typeof lists.cards === "number" && lists.cards > 0 && lists.cards === lists.nodes,
      "River: people and moments are two lists, one above the other, each scrolling in its own box",
      lists ?? { moments: "missing" },
    );

    const people = await tab.evaluate<{ content: number; box: number }>(
      `({ content: ${PEOPLE}.scrollHeight, box: ${PEOPLE}.clientHeight })`,
    );
    const crowded = people.content > people.box;
    await tab.evaluate(`${PEOPLE}.scrollIntoView({ block: "center" })`);
    const at = await tab.evaluate<Point>(`(() => {
      const b = ${PEOPLE}.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    })()`);
    const { ok, detail } = crowded
      ? await untilThePageMoves(() => tab.wheel(at.x, at.y, 300))
      : { ok: true, detail: { nothingToScroll: true } };
    const moved = await tab.evaluate<number>(`${PEOPLE}.scrollTop`);
    check(
      ok && (!crowded || moved > 0),
      "River: the wheel over the roster scrolls the roster, and carries on down the page at its end",
      { ...detail, people: moved },
    );
  }

  await load("subway");
  {
    const sides = await tab.evaluate<Record<string, unknown> | null>(`(() => {
      const people = ${PEOPLE};
      const moments = ${MOMENTS};
      const left = ${ROSTER}.querySelector(".origins-pane.is-people");
      const right = ${ROSTER}.querySelector(".origins-pane.is-moments");
      if (people === null || moments === null || left === null || right === null) return null;
      const l = left.getBoundingClientRect();
      const r = right.getBoundingClientRect();
      return {
        under: ${ROSTER}.getBoundingClientRect().top >= ${MAP}.getBoundingClientRect().bottom,
        beside: l.right <= r.left && Math.abs(l.top - r.top) <= 1,
        overflow: [getComputedStyle(people).overflowY, getComputedStyle(moments).overflowY],
        more: moments.scrollHeight > moments.clientHeight,
        page: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
      };
    })()`);
    const page = sides?.page as number[] | undefined;
    check(
      sides !== null && sides.under === true && sides.beside === true &&
        JSON.stringify(sides.overflow) === `["auto","auto"]` && sides.more === true &&
        page !== undefined && page[0] <= page[1],
      "Subway: people and moments are side by side under the map, each scrolling down in its own box",
      sides ?? { moments: "missing" },
    );
  }

  await load("river", 900, 900);
  {
    const rows = await tab.evaluate<Record<string, unknown> | null>(`(() => {
      const lists = [${PEOPLE}, ${MOMENTS}];
      if (lists.includes(null)) return null;
      return {
        under: ${ROSTER}.getBoundingClientRect().top >= ${MAP}.getBoundingClientRect().bottom,
        lists: lists.map((list) => {
          const tops = [...list.querySelectorAll(".origins-card, .origins-detail-card")]
            .map((c) => c.getBoundingClientRect().top);
          return {
            row: tops.length > 0 && tops.every((t) => Math.abs(t - tops[0]) <= 1),
            sideways: list.scrollWidth > list.clientWidth,
            down: list.scrollHeight > list.clientHeight,
          };
        }),
        page: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
      };
    })()`);
    const each = (rows?.lists ?? []) as Array<{ row: boolean; sideways: boolean; down: boolean }>;
    const page = rows?.page as number[] | undefined;
    check(
      rows !== null && rows.under === true && each.length === 2 &&
        each.every((l) => l.row && l.sideways && !l.down) &&
        page !== undefined && page[0] <= page[1],
      "a narrow window: people and moments are two rows that scroll sideways",
      rows ?? { moments: "missing" },
    );

    const widths = await tab.evaluate<{ person: number; moment: number } | null>(`(() => {
      const p = ${PEOPLE}?.querySelector(".origins-card");
      const m = ${MOMENTS}?.querySelector(".origins-detail-card");
      if (!p || !m) return null;
      return { person: p.getBoundingClientRect().width, moment: m.getBoundingClientRect().width };
    })()`);
    check(
      widths !== null && Math.abs(widths.person - widths.moment) <= 1,
      "a narrow window: a moment's card in its row is as wide as a person's",
      widths ?? { cards: "missing" },
    );
  }

  // --- a moment's card and its pill ------------------------------------------------
  // Hovering either lights the other, and the people through the moment.

  await load("river");
  {
    const data = parseData(JSON.parse(
      await tab.evaluate<string>(`document.getElementById("origins-data").textContent`),
    ));
    const gathering = buildStory(data.moments, data.people).moments
      .find((g) => g.through.some((p) => p.vouched));
    const id = gathering?.moment.id ?? "";
    const want = [...new Set((gathering?.through ?? []).filter((p) => p.vouched).map((p) => p.slug))]
      .sort();
    const card = `#origins-roster .origins-detail-card[data-moment="${id}"]`;
    const oval = `#origins-braid .origins-node[data-moment="${id}"] .origins-oval`;
    const stroke = `getComputedStyle(document.querySelector(${JSON.stringify(oval)})).stroke`;
    const lit = `[...new Set([...${MAP}.querySelectorAll("path.origins-thread.is-lit")].map((p) => p.dataset.person))].sort()`;
    const there = await tab.evaluate<boolean>(`document.querySelector(${JSON.stringify(card)}) !== null`);
    await tab.move(5, 5);
    await sleep(200);
    const rest = await tab.evaluate<string>(stroke);
    let over: { lit: string[]; stroke: string } = { lit: [], stroke: rest };
    if (there) {
      const at = await centreOf(card);
      await tab.move(at.x, at.y);
      await tab.waitFor(`${lit}.length > 0 && ${stroke} !== ${JSON.stringify(rest)}`);
      over = await tab.evaluate<{ lit: string[]; stroke: string }>(
        `({ lit: ${lit}, stroke: ${stroke} })`,
      );
    }
    await tab.move(5, 5);
    const dark = await tab.waitFor(`${MAP}.querySelectorAll(".is-lit, .is-hot").length === 0`);
    check(
      there && want.length > 0 && JSON.stringify(over.lit) === JSON.stringify(want) &&
        over.stroke !== rest && dark,
      "mouse: hovering a moment's card lights the people who were there and outlines its pill",
      { moment: id, there, want, lit: over.lit, rest, stroke: over.stroke, dark },
    );

    const tint = `(() => {
      const c = document.querySelector(${JSON.stringify(card)});
      return c === null ? null : getComputedStyle(c).backgroundColor;
    })()`;
    await sleep(300);
    const away = await tab.evaluate<string | null>(tint);
    const pill = await centreOf(oval);
    await tab.move(pill.x, pill.y);
    const tinted = away !== null && (await tab.waitFor(`${tint} !== ${JSON.stringify(away)}`));
    check(
      tinted,
      "mouse: hovering a moment in the map tints its card in the list",
      { moment: id, away, over: await tab.evaluate(tint) },
    );
    await tab.move(5, 5);
  }

  await load("river");
  {
    const story = await storyOf();
    const card = MOMENT_CARD(peopled(story)[0] ?? "");
    const tint = `(() => {
      const c = document.querySelector(${JSON.stringify(card)});
      return c === null ? null : getComputedStyle(c).backgroundColor;
    })()`;
    await tab.move(5, 5);
    await sleep(300);
    const away = await tab.evaluate<string | null>(tint);
    const at = await onCard(card);
    if (at !== null) await tab.move(at.x, at.y);
    const tinted = away !== null && at !== null &&
      (await tab.waitFor(`${tint} !== ${JSON.stringify(away)}`));
    const over = await tab.evaluate<string | null>(tint);
    await tab.move(5, 5);
    const back = await tab.waitFor(`${tint} === ${JSON.stringify(away)}`);
    check(
      tinted && back,
      "mouse: a moment's card is tinted while the pointer is on it",
      { away, over, back },
    );
  }

  // A meetup knows three kinds of person: confirmed there, recorded away or
  // not yet in the group, and in the group with nothing recorded. Only the
  // first is lit, the second steps back, and the third steps back half as
  // far: nothing says they were there, and nothing says they were not.
  await load("river");
  {
    const story = await storyOf();
    const kinds = (id: string) => {
      const g = story.moments.find((m) => m.moment.id === id);
      const through = g?.through ?? [];
      return {
        confirmed: through.filter((p) => p.vouched).map((p) => p.slug),
        unsure: through.filter((p) => !p.vouched && !p.away).map((p) => p.slug),
        out: story.threads.map((t) => t.person.slug)
          .filter((slug) => !through.some((p) => p.slug === slug && !p.away)),
      };
    };
    const meetup = story.moments.find((g) => {
      const k = kinds(g.moment.id);
      return g.moment.trunk && k.confirmed.length > 0 && k.unsure.length > 0 && k.out.length > 0;
    });
    const id = meetup?.moment.id ?? "";
    const k = kinds(id);
    /** Each person's marks of one kind in the map: whether each is lit, and its opacity. */
    const marks = (selector: string) => `(() => {
      const out = {};
      for (const p of ${MAP}.querySelectorAll(${JSON.stringify(selector)})) {
        (out[p.dataset.person] ??= []).push({ lit: p.classList.contains("is-lit"), opacity: getComputedStyle(p).opacity });
      }
      return out;
    })()`;
    const threads = marks("path.origins-thread");
    const near = (opacity: string, want: number) => Math.abs(Number(opacity) - want) <= 0.01;
    // One unrecorded person with a bead somewhere and a face, whose bead and
    // face are looked at as well as their thread.
    const witness = await tab.evaluate<string | null>(
      `${JSON.stringify(k.unsure)}.find((slug) =>
        ${MAP}.querySelector('.origins-bead[data-person="' + slug + '"]') !== null &&
        ${MAP}.querySelector('.origins-root[data-person="' + slug + '"]') !== null) ?? null`,
    );
    const tints = `(${JSON.stringify(k.unsure.map(PERSON_CARD))}).map((s) => getComputedStyle(document.querySelector(s)).backgroundColor)`;
    // The transition has run its course once everyone out of it is at 0.25.
    const stepped = `(() => {
      const t = ${threads};
      return ${JSON.stringify(k.out)}.every((slug) => (t[slug] ?? []).every((p) => Math.abs(Number(p.opacity) - 0.25) <= 0.01));
    })()`;
    type Marks = Record<string, Array<{ lit: boolean; opacity: string }>>;
    const look = async () => ({
      threads: await tab.evaluate<Marks>(threads),
      beads: await tab.evaluate<Marks>(marks(".origins-bead")),
      faces: await tab.evaluate<Marks>(marks(".origins-root")),
      tints: await tab.evaluate<string[]>(tints),
    });
    const judge = (now: Awaited<ReturnType<typeof look>>, tintsBefore: string[]) => {
      const unlit = k.confirmed.filter((slug) =>
        (now.threads[slug] ?? []).length === 0 || now.threads[slug].some((p) => !p.lit || !near(p.opacity, 1))
      );
      const half = (p: { lit: boolean; opacity: string }) => !p.lit && near(p.opacity, 0.75);
      const changed = k.unsure.filter((slug) => !(now.threads[slug] ?? []).every(half));
      const witnessMarks = witness === null ? [] : [...(now.beads[witness] ?? []), ...(now.faces[witness] ?? [])];
      const witnessHalf = witness !== null && witnessMarks.length >= 2 && witnessMarks.every(half);
      const undimmed = k.out.filter((slug) => (now.threads[slug] ?? []).some((p) => !near(p.opacity, 0.25)));
      const tinted = JSON.stringify(now.tints) !== JSON.stringify(tintsBefore);
      return {
        ok: unlit.length === 0 && changed.length === 0 && witnessHalf && undimmed.length === 0 && !tinted,
        unlit,
        changed,
        witness,
        witnessMarks,
        undimmed,
        tinted,
      };
    };
    const nothingLeft = `(document.querySelectorAll(".is-lit, .is-unsure, .is-picked").length === 0 && [...${MAP}.querySelectorAll(".origins-thread, .origins-bead, .origins-root")].every((e) => getComputedStyle(e).opacity === "1"))`;

    await tab.move(5, 5);
    await sleep(300);
    const tintsBefore = await tab.evaluate<string[]>(tints);
    const pill = await centreOf(OVAL(id));
    await tab.move(pill.x, pill.y);
    await tab.waitFor(stepped);
    await sleep(300);
    const hovering = judge(await look(), tintsBefore);
    await tab.move(5, 5);
    const clearAfterHover = await tab.waitFor(nothingLeft);
    check(
      meetup !== undefined && hovering.ok && clearAfterHover,
      "hovering a meetup lights who was confirmed there, dims who was away or not yet in the group, and dims everyone else a little",
      { moment: id, ...k, ...hovering, clearAfterHover },
    );

    const clicked = await clickCard(MOMENT_CARD(id));
    await mapSettles();
    await tab.move(5, 5);
    await tab.waitFor(stepped);
    await sleep(300);
    const picking = judge(await look(), tintsBefore);
    await tab.key("Escape");
    const clearAfterPick = await tab.waitFor(nothingLeft);
    check(
      meetup !== undefined && clicked && picking.ok && clearAfterPick,
      "a click on a meetup's card lights who was confirmed there, dims who was away or not yet in the group, dims everyone else a little, and letting go leaves nothing on anyone",
      { moment: id, clicked, ...picking, clearAfterPick },
    );

    // A meetup nobody is recorded at, and where nobody joined, lights nobody,
    // and still draws the people in the group then a little way back and
    // everyone else further.
    const empty = story.moments.find((g) => g.moment.trunk && !g.through.some((p) => p.vouched));
    if (empty !== undefined) {
      const e = kinds(empty.moment.id);
      const settled = `(() => {
        const t = ${threads};
        return ${JSON.stringify(e.out)}.every((slug) => (t[slug] ?? []).every((p) => Math.abs(Number(p.opacity) - 0.25) <= 0.01)) &&
          ${JSON.stringify(e.unsure)}.every((slug) => (t[slug] ?? []).every((p) => Math.abs(Number(p.opacity) - 0.75) <= 0.01));
      })()`;
      await tab.move(5, 5);
      await sleep(300);
      const at = await centreOf(OVAL(empty.moment.id));
      await tab.move(at.x, at.y);
      // Its card in the list is lit while the pointer is on its pill, which
      // says the hover arrived.
      const over = await tab.waitFor(has(MOMENT_CARD(empty.moment.id), "is-lit"));
      await tab.waitFor(settled);
      await sleep(300);
      const now = await tab.evaluate<Marks>(threads);
      const lit = await tab.evaluate<number>(`document.querySelectorAll("[data-person].is-lit").length`);
      const notHalf = e.unsure.filter((slug) => (now[slug] ?? []).some((p) => !near(p.opacity, 0.75)));
      const notBack = e.out.filter((slug) => (now[slug] ?? []).some((p) => !near(p.opacity, 0.25)));
      await tab.move(5, 5);
      const back = await tab.waitFor(
        `[...${MAP}.querySelectorAll("path.origins-thread")].every((p) => getComputedStyle(p).opacity === "1")`,
      );
      check(
        over && lit === 0 && e.unsure.length > 0 && e.out.length > 0 && notHalf.length === 0 &&
          notBack.length === 0 && back,
        "hovering a meetup with nobody confirmed at it dims the people in the group a little and everyone else further",
        { moment: empty.moment.id, over, lit, notHalf, notBack, back },
      );
    }
  }

  // Someone the record lists away from a moment that is not a meetup is drawn
  // there as at a meetup: their thread breaks at its pill, with a hollow bead
  // in their slot inside it.
  {
    const missing: Record<string, unknown[]> = {};
    let absences = 0;
    for (const mode of ["river", "subway"] as const) {
      await load(mode);
      const story = await storyOf();
      const away = story.moments.filter((g) => !g.moment.trunk).flatMap((g) =>
        g.through.filter((p) => p.away).map((p) => ({ oval: OVAL(g.moment.id), slug: p.slug }))
      );
      absences += away.length;
      missing[mode] = await tab.evaluate<unknown[]>(`${JSON.stringify(away)}.filter(({ oval: selector, slug }) => {
        const oval = document.querySelector(selector);
        if (oval === null) return true;
        const o = oval.getBoundingClientRect();
        return ![...${MAP}.querySelectorAll('circle.origins-bead.is-away[data-person="' + slug + '"]')].some((b) => {
          const r = b.getBoundingClientRect();
          const x = r.left + r.width / 2;
          const y = r.top + r.height / 2;
          return x > o.left && x < o.right && y > o.top && y < o.bottom;
        });
      })`);
    }
    check(
      absences > 0 && Object.values(missing).every((m) => m.length === 0),
      "someone recorded away from a moment that is not a meetup has a hollow bead in its pill",
      { absences, missing },
    );
  }

  // Hovering such a moment lights who was at it, and draws someone away from
  // it as far back as someone who was never there: not lit, and not half way
  // back like someone the record says nothing about.
  await load("river");
  {
    const story = await storyOf();
    const moment = story.moments.find((g) =>
      !g.moment.trunk && g.through.some((p) => p.away) && g.through.some((p) => p.vouched)
    );
    const through = moment?.through ?? [];
    const id = moment?.moment.id ?? "";
    const named = through.filter((p) => p.vouched).map((p) => p.slug).sort();
    const away = through.filter((p) => p.away).map((p) => p.slug);
    const elsewhere = story.threads.map((t) => t.person.slug)
      .filter((slug) => !through.some((p) => p.slug === slug));
    const threads = `(() => {
      const out = {};
      for (const p of ${MAP}.querySelectorAll("path.origins-thread")) {
        out[p.dataset.person] = { lit: p.classList.contains("is-lit"), unsure: p.classList.contains("is-unsure"), opacity: Number(getComputedStyle(p).opacity) };
      }
      return out;
    })()`;
    type Drawn = Record<string, { lit: boolean; unsure: boolean; opacity: number }>;
    const settled = `(() => {
      const t = ${threads};
      return ${JSON.stringify([...away, ...elsewhere])}.every((slug) => t[slug] !== undefined && Math.abs(t[slug].opacity - 0.25) <= 0.01);
    })()`;
    await tab.move(5, 5);
    await sleep(300);
    let now: Drawn = {};
    if (moment !== undefined) {
      const pill = await centreOf(OVAL(id));
      await tab.move(pill.x, pill.y);
      await tab.waitFor(settled);
      await sleep(300);
      now = await tab.evaluate<Drawn>(threads);
    }
    await tab.move(5, 5);
    const unlit = named.filter((slug) => now[slug] === undefined || !now[slug].lit || Math.abs(now[slug].opacity - 1) > 0.01);
    const outside = elsewhere.find((slug) => now[slug] !== undefined);
    const wrong = away.filter((slug) =>
      now[slug] === undefined || now[slug].lit || now[slug].unsure || outside === undefined ||
      Math.abs(now[slug].opacity - now[outside].opacity) > 0.01
    );
    check(
      moment !== undefined && away.length > 0 && unlit.length === 0 && wrong.length === 0,
      "hovering a moment that is not a meetup lights who was at it and dims someone away from it as far as someone who was never there",
      {
        moment: id,
        named,
        away,
        unlit,
        wrong,
        drawn: Object.fromEntries([...named, ...away, outside ?? ""].map((slug) => [slug, now[slug]])),
      },
    );
  }

  // Such a moment's card and what a screen reader says for its pill leave out
  // whoever was away from it.
  await load("river");
  {
    const story = await storyOf();
    const moment = story.moments.find((g) => !g.moment.trunk && g.through.some((p) => p.away));
    const id = moment?.moment.id ?? "";
    const there = (moment?.through ?? []).filter((p) => !p.away).length;
    const names = (moment?.through ?? []).filter((p) => p.away).map((p) =>
      story.threads.find((t) => t.person.slug === p.slug)!.person.name
    );
    const said = await tab.evaluate<{ card: string | null; label: string | null }>(`({
      card: document.querySelector(${JSON.stringify(MOMENT_CARD(id))})?.textContent ?? null,
      label: document.querySelector(${JSON.stringify(PILL(id))})?.getAttribute("aria-label") ?? null,
    })`);
    const count = there === 1 ? "1 person" : `${there} people`;
    check(
      moment !== undefined && names.length > 0 && said.card !== null && said.label !== null &&
        names.every((name) => !said.card!.includes(name)) && said.label.endsWith(`, ${count}`),
      "a moment that is not a meetup neither names nor counts someone away from it",
      { moment: id, away: names, count, ...said },
    );
  }

  // The list's card and the popup's are one card, the popup's with an X. In
  // Subway, where the lists are under the map and the popup opens.
  await load("subway");
  {
    const story = await storyOf();
    const id = story.moments.map((g) => g.moment).find((m) =>
      (m.blurb ?? "") !== "" && ((m.links ?? []).length > 0 || (m.permalink ?? "") !== "")
    )?.id ?? "";
    const words = (selector: string) => `(() => {
      const c = document.querySelector(${JSON.stringify(selector)});
      if (c === null) return null;
      const copy = c.cloneNode(true);
      for (const x of copy.querySelectorAll("[data-origins-dismiss]")) x.remove();
      return { text: copy.textContent, links: [...copy.querySelectorAll("a")].map((a) => a.href) };
    })()`;
    let opened = false;
    if (id !== "") {
      const at = await centreOf(OVAL(id));
      await tab.click(at.x, at.y);
      opened = await tab.waitFor(popupOpen);
    }
    type Said = { text: string; links: string[] } | null;
    const map = await tab.evaluate<Said>(
      words(`.origins-popup .origins-detail-card[data-moment="${id}"]`),
    );
    const list = await tab.evaluate<Said>(words(MOMENT_CARD(id)));
    check(
      id !== "" && opened && map !== null && list !== null && map.links.length > 0 &&
        JSON.stringify(map) === JSON.stringify(list),
      "a moment's card in the list says what its card in the map says",
      { moment: id, opened, map, list },
    );
  }

  // --- a pick --------------------------------------------------------------------------
  // A click on a card in either list picks it: the map goes to it, and it
  // stays lit until it is let go. A click on a moment or a face in the map
  // picks too, and marks the card in the list.

  await load("river");
  {
    const story = await storyOf();
    const far = await furthest(
      Object.fromEntries(story.threads.map((t) => [t.person.slug, FACE(t.person.slug)])),
    );
    const id = far?.id ?? "";
    const clicked = await clickCard(PERSON_CARD(id));
    await mapSettles();
    const where = await centredIn(FACE(id));
    await tab.move(5, 5);
    await sleep(300);
    const after = await tab.evaluate<{ threads: string[]; face: boolean; card: boolean; picked: boolean }>(
      `({
        threads: ${LIT_PEOPLE},
        face: ${has(FACE(id), "is-lit")},
        card: ${has(PERSON_CARD(id), "is-lit")},
        picked: ${has(PERSON_CARD(id), "is-picked")},
      })`,
    );
    check(
      far !== null && far.off > 50 && clicked && where.ok &&
        JSON.stringify(after.threads) === JSON.stringify([id]) && after.face && after.card &&
        after.picked,
      "a click on a person's card brings their face to the middle of the map and leaves them lit",
      { person: id, off: far?.off, clicked, where, ...after },
    );
  }

  await load("river");
  {
    const story = await storyOf();
    const id = story.threads[0]?.person.slug ?? "";
    const card = PERSON_CARD(id);
    // The links go to other sites. Stopped before the browser follows them,
    // and only that: the click still reaches the card on its way up.
    await tab.evaluate(`(document.addEventListener("click", (e) => {
      if (e.target.closest("a") !== null) e.preventDefault();
    }, true), true)`);
    const link = await tab.evaluate<Point | null>(`(() => {
      const a = document.querySelector(${JSON.stringify(`${card} a.origins-card-alias`)});
      if (a === null) return null;
      a.scrollIntoView({ block: "center", inline: "center" });
      const b = a.getBoundingClientRect();
      const at = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
      return a.contains(document.elementFromPoint(at.x, at.y)) ? at : null;
    })()`);
    if (link !== null) await tab.click(link.x, link.y);
    await tab.move(5, 5);
    // The click leaves focus on the link, and focus in a card lights its
    // person as hover does. That light is not a pick; take focus away so
    // only a pick could leave anyone lit.
    await tab.evaluate(`(document.activeElement?.blur(), true)`);
    await sleep(300);
    const after = await tab.evaluate<{ picked: number; lit: number; stayed: boolean }>(`({
      picked: document.querySelectorAll(".is-picked").length,
      lit: document.querySelectorAll(".is-lit").length,
      stayed: location.pathname === "/origins/",
    })`);
    // The same card off its links does pick.
    const clicked = await clickCard(card);
    const picks = await tab.evaluate<boolean>(has(card, "is-picked"));
    await tab.key("Escape");
    check(
      link !== null && after.stayed && after.picked === 0 && after.lit === 0 && clicked && picks,
      "a click on a link in a person's card picks nobody",
      { person: id, link, ...after, clicked, picks },
    );
  }

  await load("river");
  {
    const story = await storyOf();
    const id = story.moments.map((g) => g.moment).find((m) =>
      (m.links ?? []).length > 0 || (m.permalink ?? "") !== ""
    )?.id ?? "";
    const card = MOMENT_CARD(id);
    // As for a person's card: stopped before the browser follows the link,
    // and the click still reaches the card on its way up.
    await tab.evaluate(`(document.addEventListener("click", (e) => {
      if (e.target.closest("a") !== null) e.preventDefault();
    }, true), true)`);
    const link = await tab.evaluate<Point | null>(`(() => {
      const a = document.querySelector(${JSON.stringify(`${card} a`)});
      if (a === null) return null;
      a.scrollIntoView({ block: "center", inline: "center" });
      const b = a.getBoundingClientRect();
      const at = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
      return a.contains(document.elementFromPoint(at.x, at.y)) ? at : null;
    })()`);
    if (link !== null) await tab.click(link.x, link.y);
    await tab.move(5, 5);
    await tab.evaluate(`(document.activeElement?.blur(), true)`);
    await sleep(300);
    const after = await tab.evaluate<{ picked: number; lit: number; stayed: boolean }>(`({
      picked: document.querySelectorAll(".is-picked").length,
      lit: document.querySelectorAll(".is-lit").length,
      stayed: location.pathname === "/origins/",
    })`);
    // The same card off its links does pick.
    const clicked = await clickCard(card);
    const picks = await tab.evaluate<boolean>(has(card, "is-picked"));
    await tab.key("Escape");
    check(
      link !== null && after.stayed && after.picked === 0 && after.lit === 0 && clicked && picks,
      "a click on a link in a moment's card picks nothing",
      { moment: id, link, ...after, clicked, picks },
    );
  }

  // The card is a click target too, so a link reaching across it would take
  // a click meant for the card off the page.
  await load("river");
  {
    const story = await storyOf();
    const id = story.moments.map((g) => g.moment).find((m) =>
      (m.links ?? []).length > 0 || (m.permalink ?? "") !== ""
    )?.id ?? "";
    const card = MOMENT_CARD(id);
    await tab.evaluate(`(document.addEventListener("click", (e) => {
      if (e.target.closest("a") !== null) e.preventDefault();
    }, true), true)`);
    const beside = await tab.evaluate<
      { x: number; y: number; past: boolean; inCard: boolean; onLink: boolean } | null
    >(`(() => {
      const c = document.querySelector(${JSON.stringify(card)});
      const a = c?.querySelector("a.origins-detail-link");
      if (!a) return null;
      c.scrollIntoView({ block: "center", inline: "center" });
      const b = c.getBoundingClientRect();
      const l = a.getBoundingClientRect();
      // Halfway between the end of the link's words and the inside of the
      // card's right padding: past the words, and where a link stretched
      // across the card would be.
      const words = document.createRange();
      words.selectNodeContents(a);
      const end = words.getBoundingClientRect().right;
      const s = getComputedStyle(c);
      const inside = b.right - parseFloat(s.paddingRight) - parseFloat(s.borderRightWidth);
      const at = { x: (end + inside) / 2, y: l.top + l.height / 2 };
      const e = document.elementFromPoint(at.x, at.y);
      return { ...at, past: at.x > end + 2, inCard: c.contains(e), onLink: a.contains(e) };
    })()`);
    if (beside !== null) await tab.click(beside.x, beside.y);
    await sleep(300);
    const after = await tab.evaluate<{ picked: boolean; stayed: boolean }>(`({
      picked: ${has(card, "is-picked")},
      stayed: location.pathname === "/origins/",
    })`);
    check(
      beside !== null && beside.past && beside.inCard && !beside.onLink && after.picked &&
        after.stayed,
      "a click beside a link in a moment's card picks the card and goes nowhere",
      { moment: id, beside, ...after },
    );
  }

  // One builder makes the card in the list and the card in the popup, so the
  // arrangement is looked at in both, and in the popup the X has to keep
  // clear of the name and the badge.
  await load("river");
  {
    const story = await storyOf();
    const id = story.threads.find((t) =>
      t.person.quote !== "" && t.person.description !== "" && t.person.links.length > 0 &&
      t.joinsTrunkAt !== null
    )?.person.slug ?? "";
    const laidOut = (card: string) =>
      tab.evaluate<{ ok: boolean } & Record<string, unknown>>(`(() => {
        const c = ${card};
        if (c === null) return { ok: false, missing: true };
        c.scrollIntoView({ block: "center", inline: "center" });
        const box = (s) => {
          const e = c.querySelector(s);
          if (e === null) return null;
          const b = e.getBoundingClientRect();
          return { top: b.top, bottom: b.bottom, left: b.left, right: b.right };
        };
        const face = box(".origins-card-avatar");
        const name = box(".origins-card-name");
        const badge = box(".origins-badge");
        const handle = box(".origins-card-alias");
        const link = box(".origins-card-link");
        const under = [".origins-card-desc", ".origins-card-quote", ".origins-card-join"].map(box);
        const x = box(".origins-dismiss");
        if ([face, name, badge, handle, link, ...under].includes(null)) {
          return { ok: false, face, name, badge, handle, link, under };
        }
        const beside = [name, badge, handle, link].every((b) => b.left >= face.right);
        const oneLine = handle.top < link.bottom && handle.bottom > link.top && link.left >= handle.right;
        const below = under.every((b, i) =>
          Math.abs(b.left - face.left) <= 1 && b.top >= (i === 0 ? face.bottom : under[i - 1].bottom) - 1
        );
        const apart = (a, b) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
        const clear = x === null || (apart(x, name) && apart(x, badge));
        return { ok: beside && oneLine && below && clear, beside, oneLine, below, clear, face, name, badge, handle, link, under };
      })()`);
    const listed = await laidOut(`document.querySelector(${JSON.stringify(PERSON_CARD(id))})`);
    await load("subway");
    let popped: ({ ok: boolean } & Record<string, unknown>) | null = null;
    if (id !== "") {
      const face = await centreOf(FACE(id));
      await tab.click(face.x, face.y);
      if (await tab.waitFor(popupOpen)) popped = await laidOut(`${POPUP}.querySelector(".origins-card")`);
    }
    check(
      id !== "" && listed.ok && popped?.ok === true,
      "a person's card has their name, badge, handle and links beside the picture, and what they do, their own words and where they joined under it",
      { person: id, listed, popped },
    );
  }

  // The About page writes a member's profile in its template, and the
  // Origins page builds the card in its script, each from the same data. A
  // member the two disagree about is what this is for, so every member is
  // read on both, each part with its words and its address, in the order the
  // page has them. Quote marks the stylesheet adds are not text.
  await load("river");
  {
    const story = await storyOf();
    const members = story.threads.filter((t) => t.person.member).map((t) => t.person.slug);
    type Part = [string, string, string | null];
    const read = (profiles: string, parts: Record<string, string>) =>
      tab.evaluate<Record<string, Part[] | null>>(`(() => {
        const parts = ${JSON.stringify(parts)};
        const out = {};
        for (const slug of ${JSON.stringify(members)}) {
          const c = document.querySelector(${JSON.stringify(profiles)} + '[data-person="' + slug + '"]');
          if (c === null) { out[slug] = null; continue; }
          out[slug] = [...c.querySelectorAll(Object.values(parts).join(", "))].map((e) => [
            Object.keys(parts).find((k) => e.matches(parts[k])),
            e.textContent,
            e.getAttribute("href"),
          ]);
        }
        return out;
      })()`);
    const origins = await read("#origins-roster .origins-card", {
      name: ".origins-card-name",
      badge: ".origins-badge",
      handle: ".origins-card-alias",
      link: ".origins-card-link",
      description: ".origins-card-desc",
      quote: ".origins-card-quote",
      joined: ".origins-card-join",
    });
    await tab.goto(`${server.origin}/about/`);
    const about = await read(".about-profile", {
      name: ".about-head .title",
      badge: ".about-badge",
      handle: ".about-handle",
      link: ".about-link",
      description: ".about-desc",
      quote: ".about-profile blockquote",
      joined: ".about-join",
    });
    const differ = members.filter((slug) =>
      origins[slug] === null || about[slug] === null ||
      JSON.stringify(origins[slug]) !== JSON.stringify(about[slug])
    );
    // Every member has a name, a badge and a handle, so two pages that both
    // find none of a part have lost it rather than agreed on it.
    const unread = (parts: Record<string, Part[] | null>) =>
      members.filter((slug) =>
        !["name", "badge", "handle"].every((kind) => (parts[slug] ?? []).some((p) => p[0] === kind))
      );
    const lacking = { origins: unread(origins), about: unread(about) };
    check(
      members.length > 0 && differ.length === 0 && lacking.origins.length === 0 &&
        lacking.about.length === 0,
      "the About page and the Origins page say the same about every member",
      {
        members: members.length,
        lacking,
        differ: differ.map((slug) => ({ slug, origins: origins[slug], about: about[slug] })),
      },
    );
  }

  // Each profile is a box of its own, in either theme, and the two boxes of a
  // row line up top and bottom however much each member has to say.
  await tab.size(1400, 1000);
  await tab.goto(`${server.origin}/about/`);
  {
    const boxes = (theme: string) =>
      tab.evaluate<{ ok: boolean } & Record<string, unknown>>(`(() => {
        document.documentElement.setAttribute("data-theme", ${JSON.stringify(theme)});
        const clear = (c) => c === "transparent" || c === "rgba(0, 0, 0, 0)";
        const page = [document.body, document.documentElement]
          .map((e) => getComputedStyle(e).backgroundColor)
          .find((c) => !clear(c));
        const names = document.querySelectorAll(".columns h4.title").length;
        const all = [...document.querySelectorAll(".about-profile")].map((e) => {
          const b = e.getBoundingClientRect();
          return {
            top: b.top + scrollY, bottom: b.bottom + scrollY, left: b.left, right: b.right,
            background: getComputedStyle(e).backgroundColor,
          };
        });
        const shaded = all.every((b) => !clear(b.background) && b.background !== page);
        const apart = (a, b) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
        const overlaps = [];
        const uneven = [];
        let rows = 0;
        all.forEach((a, i) => all.slice(i + 1).forEach((b, j) => {
          if (!apart(a, b)) overlaps.push([i, i + 1 + j]);
          if (a.top < b.bottom && b.top < a.bottom) {
            rows += 1;
            if (Math.abs(a.top - b.top) > 1 || Math.abs(a.bottom - b.bottom) > 1) uneven.push([i, i + 1 + j]);
          }
        }));
        return {
          ok: all.length > 0 && all.length === names && shaded && overlaps.length === 0 && rows > 0 && uneven.length === 0,
          boxes: all.length, names, page, background: all[0]?.background, shaded, overlaps, rows, uneven,
        };
      })()`);
    const light = await boxes("light");
    const dark = await boxes("dark");
    await tab.evaluate(`document.documentElement.removeAttribute("data-theme")`);
    check(
      light.ok && dark.ok,
      "About: every profile is in its own box, and the boxes of a row are the same height",
      { light, dark },
    );
  }

  await load("river");
  {
    const story = await storyOf();
    type Link = { href: string; here: boolean; target: string | null; rel: string | null };
    // This site is where the page is served from, or where it is published:
    // zola writes a page's own links as absolute addresses under its
    // base_url, which is not the address of the server the check runs.
    const anchors = (root: string) =>
      tab.evaluate<Link[]>(
        `(() => {
          const published = document.querySelector('meta[property="og:url"]')?.content;
          const home = [location.origin, published ? new URL(published).origin : location.origin];
          return [...${root}.querySelectorAll("a")].map((a) => ({
            href: a.getAttribute("href"),
            here: home.includes(new URL(a.href, location.href).origin),
            target: a.getAttribute("target"),
            rel: a.getAttribute("rel"),
          }));
        })()`,
      );
    const right = (a: Link) =>
      a.here
        ? a.target !== "_blank"
        : a.target === "_blank" && (a.rel ?? "").split(" ").includes("noopener");
    const rail = await anchors(ROSTER);
    // A moment with a page on this site, so its popup card holds a link that
    // stays in the tab.
    const id = story.moments.map((g) => g.moment).find((m) => (m.permalink ?? "") !== "")?.id ?? "";
    await load("subway");
    let popup: Link[] = [];
    if (id !== "") {
      const at = await centreOf(OVAL(id));
      await tab.click(at.x, at.y);
      if (await tab.waitFor(popupOpen)) popup = await anchors(POPUP);
    }
    const kinds = { here: rail.filter((a) => a.here).length, away: rail.filter((a) => !a.here).length };
    check(
      kinds.here > 0 && kinds.away > 0 && popup.length > 0 && rail.every(right) && popup.every(right),
      "a link in a card to another site opens a new tab, and a link to this site stays in the tab",
      {
        moment: id,
        rail: kinds,
        railWrong: rail.filter((a) => !right(a)).slice(0, 5),
        popup: popup.length,
        popupWrong: popup.filter((a) => !right(a)),
      },
    );
  }

  await load("river");
  {
    const years = await tab.evaluate<Array<{ text: string; top: number; line: number }>>(`(() => {
      const ticks = [...${MAP}.querySelectorAll("path.origins-year-tick")];
      return [...${MAP}.querySelectorAll("text.origins-year.is-boundary")].map((t, i) => ({
        text: t.textContent,
        top: t.getBoundingClientRect().top,
        line: ticks[i]?.getBoundingClientRect().top ?? NaN,
      }));
    })()`);
    check(
      years.length > 0 && years.every((y) => y.top >= y.line),
      "River: each year's number is under its line",
      years.filter((y) => !(y.top >= y.line)),
    );
  }

  await load("river");
  {
    const story = await storyOf();
    const far = await furthest(Object.fromEntries(peopled(story).map((id) => [id, OVAL(id)])));
    const id = far?.id ?? "";
    const want = cameTo(story, id);
    const clicked = await clickCard(MOMENT_CARD(id));
    await mapSettles();
    const where = await centredIn(OVAL(id));
    await tab.move(5, 5);
    await sleep(300);
    const after = await tab.evaluate<{ threads: string[]; pill: boolean; card: boolean }>(
      `({
        threads: ${LIT_PEOPLE},
        pill: ${has(PILL(id), "is-picked")},
        card: ${has(MOMENT_CARD(id), "is-picked")},
      })`,
    );
    check(
      far !== null && far.off > 50 && want.length > 0 && clicked && where.ok &&
        JSON.stringify(after.threads) === JSON.stringify(want) && after.pill && after.card,
      "a click on a moment's card brings its pill to the middle of the map and leaves everyone who was there lit",
      { moment: id, off: far?.off, want, clicked, where, ...after },
    );
  }

  // Whether the map's own card was shut after each click on a card in a
  // list, and the click picked the card. In Subway, where the lists are under
  // the map and a click in the map opens the popup.
  await load("subway");
  {
    const story = await storyOf();
    const shutAfter: Array<{ shut: boolean; picked: boolean }> = [];
    for (const card of [PERSON_CARD(story.threads[0]?.person.slug ?? ""), MOMENT_CARD(peopled(story)[0] ?? "")]) {
      await clickCard(card);
      await mapSettles();
      shutAfter.push({
        shut: await tab.evaluate<boolean>(popupShut),
        picked: await tab.evaluate<boolean>(has(card, "is-picked")),
      });
    }
    check(
      shutAfter.length === 2 && shutAfter.every((s) => s.shut && s.picked),
      "a click on a card in a list opens no card in the map",
      { shutAfter },
    );
  }

  await load("river");
  {
    const story = await storyOf();
    const card = MOMENT_CARD(peopled(story)[0] ?? "");
    const ways: Array<[string, () => Promise<unknown>]> = [
      ["a second click", () => clickCard(card)],
      ["a click on empty map", async () => {
        await tab.evaluate(`${MAP}.scrollIntoView({ block: "start" })`);
        const at = await emptyMap(20);
        if (at === null) return false;
        await tab.click(at.x, at.y);
        return true;
      }],
      ["Escape", () => tab.key("Escape")],
    ];
    const seen: Record<string, unknown> = {};
    let all = true;
    for (const [way, letGo] of ways) {
      const clicked = await clickCard(card);
      await mapSettles();
      const held = await tab.evaluate<number>(`document.querySelectorAll(".is-picked").length`);
      const did = await letGo();
      await tab.move(5, 5);
      await sleep(300);
      const left = await tab.evaluate<{ picked: number; lit: number }>(`({
        picked: document.querySelectorAll(".is-picked").length,
        lit: ${MAP}.querySelectorAll("path.origins-thread.is-lit").length,
      })`);
      seen[way] = { clicked, held, did, ...left };
      all &&= clicked && held > 0 && did !== false && left.picked === 0 && left.lit === 0;
    }
    check(
      all,
      "a second click on the picked card, a click on empty map, and Escape each let go of it",
      seen,
    );
  }

  await load("river");
  {
    const story = await storyOf();
    const [a, b] = story.threads.map((t) => t.person.slug);
    const clicked = await clickCard(PERSON_CARD(a));
    await mapSettles();
    const over = await onCard(PERSON_CARD(b));
    if (over !== null) await tab.move(over.x, over.y);
    const want = [a, b].sort();
    await tab.waitFor(`${LIT_PEOPLE}.length === 2`);
    const both = await tab.evaluate<string[]>(LIT_PEOPLE);
    await tab.move(5, 5);
    await sleep(300);
    const after = await tab.evaluate<string[]>(LIT_PEOPLE);
    check(
      clicked && over !== null && JSON.stringify(both) === JSON.stringify(want) &&
        JSON.stringify(after) === JSON.stringify([a]),
      "hovering another card while one is picked lights both, and leaving it leaves the pick lit",
      { picked: a, hovered: b, both, after },
    );
  }

  await load("river");
  {
    const story = await storyOf();
    const id = peopled(story)[0] ?? "";
    const want = cameTo(story, id);
    const at = await onCard(MOMENT_CARD(id));
    if (at !== null) {
      // Two presses at one place, the second counted as the second click,
      // as a mouse sends a double click.
      await tab.move(at.x, at.y);
      for (const count of [1, 2]) {
        for (const type of ["mousePressed", "mouseReleased"]) {
          await tab.send("Input.dispatchMouseEvent", {
            type,
            x: at.x,
            y: at.y,
            button: "left",
            buttons: type === "mousePressed" ? 1 : 0,
            clickCount: count,
          });
        }
      }
    }
    await mapSettles();
    await tab.move(5, 5);
    await sleep(300);
    const after = await tab.evaluate<{ card: boolean; threads: string[] }>(
      `({ card: ${has(MOMENT_CARD(id), "is-picked")}, threads: ${LIT_PEOPLE} })`,
    );
    check(
      at !== null && want.length > 0 && after.card &&
        JSON.stringify(after.threads) === JSON.stringify(want),
      "a double click on a card leaves it picked",
      { moment: id, at, want, ...after },
    );
  }

  await load("subway");
  {
    const id = await momentPastItsList();
    const where = `({ page: scrollY, left: ${MAP}.scrollLeft, top: ${MAP}.scrollTop })`;
    const down = `${MOMENTS}.scrollTop`;
    let before: unknown = null;
    let after: unknown = null;
    let opened = false;
    let picked = false;
    let middle: ({ ok: boolean } & Record<string, unknown>) | null = null;
    let glide: { start: number; first: number; last: number } | null = null;
    if (id !== null) {
      const at = await centreOf(OVAL(id));
      before = await tab.evaluate(where);
      const start = await tab.evaluate<number>(down);
      await tab.click(at.x, at.y);
      // Straight after the click: a list that glides has not arrived yet.
      const first = await tab.evaluate<number>(down);
      opened = await tab.waitFor(popupOpen);
      await listSettles(MOMENTS);
      glide = { start, first, last: await tab.evaluate<number>(down) };
      after = await tab.evaluate(where);
      picked = await tab.evaluate<boolean>(has(MOMENT_CARD(id), "is-picked"));
      middle = await midList(MOMENT_CARD(id), MOMENTS);
    }
    check(
      id !== null && opened && picked && middle?.ok === true && glide !== null &&
        glide.last !== glide.start && glide.first !== glide.last &&
        JSON.stringify(after) === JSON.stringify(before),
      "a click on a moment in the map marks its card and glides its list until the card is in the middle of it, without moving the page or the map",
      { moment: id, opened, picked, middle, glide, before, after },
    );
  }

  await load("river");
  {
    const story = await storyOf();
    const id = peopled(story)[0] ?? "";
    const want = cameTo(story, id);
    const clicked = await clickCard(MOMENT_CARD(id));
    await mapSettles();
    const width = await tab.evaluate<number>(pictureWidth);
    const plus = await zoomButton("in");
    await tab.click(plus.x, plus.y);
    const grew = await tab.waitFor(`${pictureWidth} > ${width} * 1.2`);
    await tab.evaluate(`${MAP}.scrollIntoView({ block: "start" })`);
    const empty = await emptyMap(250);
    let dragged = false;
    if (empty !== null) {
      const start = await mapAt();
      await tab.pull(empty.x, empty.y, empty.x, empty.y - 100);
      dragged = await tab.waitFor(`${MAP}.scrollTop >= ${start.top + 90}`);
    }
    await tab.move(5, 5);
    await sleep(300);
    const after = await tab.evaluate<{ card: boolean; threads: string[] }>(
      `({ card: ${has(MOMENT_CARD(id), "is-picked")}, threads: ${LIT_PEOPLE} })`,
    );
    check(
      clicked && grew && dragged && want.length > 0 && after.card &&
        JSON.stringify(after.threads) === JSON.stringify(want),
      "zooming the map and dragging it leave the pick as it is",
      { moment: id, clicked, grew, dragged, want, ...after },
    );
  }

  await load("river");
  {
    const story = await storyOf();
    const id = peopled(story)[0] ?? "";
    const want = cameTo(story, id);
    const clicked = await clickCard(MOMENT_CARD(id));
    await mapSettles();
    await watchForMorph();
    await pressMode("subway");
    const landed = await landedIn("subway");
    const moved = await morphed();
    await tab.move(5, 5);
    await sleep(300);
    const after = await tab.evaluate<{ card: boolean; pill: boolean; threads: string[] }>(
      `({
        card: ${has(MOMENT_CARD(id), "is-picked")},
        pill: ${has(PILL(id), "is-picked")},
        threads: ${LIT_PEOPLE},
      })`,
    );
    check(
      clicked && landed && moved && want.length > 0 && after.card && after.pill &&
        JSON.stringify(after.threads) === JSON.stringify(want),
      "a pick is still marked and lit after the mode is switched",
      { moment: id, clicked, landed, moved, want, ...after },
    );
  }

  // The window narrowed from 1000px to 960px, which redraws the picture, as
  // the check of a redraw under a resting pointer below shows.
  await load("river", 1000, 1000);
  {
    const story = await storyOf();
    const id = peopled(story)[0] ?? "";
    const want = cameTo(story, id);
    const clicked = await clickCard(MOMENT_CARD(id));
    await mapSettles();
    await tab.move(5, 5);
    await tab.evaluate(`(window.__originsOld = ${PICTURE}, true)`);
    await tab.size(960, 1000);
    const redrawn = await tab.waitFor(`${PICTURE} !== window.__originsOld`);
    await sleep(300);
    const after = await tab.evaluate<{ card: boolean; pill: boolean; threads: string[] }>(
      `({
        card: ${has(MOMENT_CARD(id), "is-picked")},
        pill: ${has(PILL(id), "is-picked")},
        threads: ${LIT_PEOPLE},
      })`,
    );
    check(
      clicked && redrawn && want.length > 0 && after.card && after.pill &&
        JSON.stringify(after.threads) === JSON.stringify(want),
      "a pick is still marked and lit after the window is resized",
      { moment: id, clicked, redrawn, want, ...after },
    );
  }

  await load("river");
  {
    // Someone whose card is past the end of the people's list once the list
    // is back at its start, and whose face is in the picture.
    const slug = await tab.evaluate<string | null>(`(() => {
      const list = ${PEOPLE};
      list.scrollTop = 0;
      list.scrollLeft = 0;
      const l = list.getBoundingClientRect();
      const out = [...list.querySelectorAll(".origins-card")].find((c) =>
        c.getBoundingClientRect().top >= l.bottom &&
        ${MAP}.querySelector('.origins-root[data-person="' + c.dataset.person + '"]') !== null
      );
      return out?.dataset.person ?? null;
    })()`);
    const where = `({ page: scrollY, left: ${MAP}.scrollLeft, top: ${MAP}.scrollTop })`;
    let before: unknown = null;
    let after: unknown = null;
    let opened = false;
    let picked = false;
    let middle: ({ ok: boolean } & Record<string, unknown>) | null = null;
    if (slug !== null) {
      const at = await centreOf(FACE(slug));
      before = await tab.evaluate(where);
      await tab.click(at.x, at.y);
      await listSettles(PEOPLE);
      opened = await tab.evaluate<boolean>(popupOpen);
      after = await tab.evaluate(where);
      picked = await tab.evaluate<boolean>(has(PERSON_CARD(slug), "is-picked"));
      middle = await midList(PERSON_CARD(slug), PEOPLE);
    }
    check(
      slug !== null && !opened && picked && middle?.ok === true &&
        JSON.stringify(after) === JSON.stringify(before),
      "a click on a face in the map marks that person's card and glides the people's list until the card is in the middle of it",
      { person: slug, opened, picked, middle, before, after },
    );
  }

  // Beside the map the list's card says all the popup would, so a click in
  // the map opens nothing and only picks.
  await load("river");
  {
    const id = await momentPastItsList();
    const where = `({ page: scrollY, left: ${MAP}.scrollLeft, top: ${MAP}.scrollTop })`;
    let before: unknown = null;
    let after: unknown = null;
    let shown: Record<string, unknown> = {};
    let middle: ({ ok: boolean } & Record<string, unknown>) | null = null;
    if (id !== null) {
      const at = await centreOf(OVAL(id));
      before = await tab.evaluate(where);
      await tab.click(at.x, at.y);
      await listSettles(MOMENTS);
      after = await tab.evaluate(where);
      shown = await tab.evaluate<Record<string, unknown>>(`({
        opened: ${popupOpen},
        open: ${MAP}.querySelectorAll(".is-open").length,
        pill: ${has(PILL(id), "is-picked")},
        card: ${has(MOMENT_CARD(id), "is-picked")},
        inRail: ${ROSTER}.contains(document.activeElement),
      })`);
      middle = await midList(MOMENT_CARD(id), MOMENTS);
    }
    check(
      id !== null && shown.opened === false && shown.open === 0 && shown.pill === true &&
        shown.card === true && shown.inRail === false && middle?.ok === true &&
        JSON.stringify(after) === JSON.stringify(before),
      "beside the map, a click on a moment opens no card, marks its card in the list and glides the list to it",
      { moment: id, ...shown, middle, before, after },
    );
  }

  // Under 1024px the lists are under the map in River too, and the popup is
  // where its card is.
  await load("river", 900, 900);
  {
    const dot = await centreOf(SIDE_DOT);
    await tab.click(dot.x, dot.y);
    check(
      await tab.waitFor(popupOpen),
      "a narrow window: a click on a moment in River opens its card in the map",
    );
  }

  await load("river", 900, 900);
  {
    const id = await tab.evaluate<string>(
      `document.querySelector(${JSON.stringify(SIDE_DOT)}).dataset.moment`,
    );
    const dot = await centreOf(SIDE_DOT);
    await tab.click(dot.x, dot.y);
    const opened = await tab.waitFor(popupOpen);
    await tab.evaluate(`(window.__originsOld = ${PICTURE}, true)`);
    await tab.size(1400, 900);
    const redrawn = await tab.waitFor(`${PICTURE} !== window.__originsOld`);
    const after = await tab.evaluate<{ shut: boolean; open: number; pill: boolean; card: boolean }>(`({
      shut: ${popupShut},
      open: ${MAP}.querySelectorAll(".is-open").length,
      pill: ${has(PILL(id), "is-picked")},
      card: ${has(MOMENT_CARD(id), "is-picked")},
    })`);
    check(
      opened && redrawn && after.shut && after.open === 0 && after.pill && after.card,
      "a window widened until the lists are beside the map closes the card that was open",
      { moment: id, opened, redrawn, ...after },
    );
  }

  // A narrower window redraws the picture somewhere else. From 1000px to
  // 960px the old picture stays where it was until the redraw, so the pill
  // is still under the pointer when it is replaced. From 1500px to 1400px
  // the page above the map moved first, and the pointer was told it left
  // before the picture it left was replaced.
  await load("river", 1000, 1000);
  {
    const story = await storyOf();
    const id = peopled(story)[0] ?? "";
    const pill = await centreOf(OVAL(id));
    await tab.move(pill.x, pill.y);
    const lit = await tab.waitFor(`${LIT_PEOPLE}.length > 0 && ${has(MOMENT_CARD(id), "is-lit")}`);
    await tab.evaluate(`(window.__originsOld = ${PICTURE}, true)`);
    await tab.size(960, 1000);
    const redrawn = await tab.waitFor(`${PICTURE} !== window.__originsOld`);
    await sleep(300);
    await tab.move(5, 5);
    await sleep(300);
    const left = await tab.evaluate<string[]>(
      `[...document.querySelectorAll(".is-lit")].map((e) => e.getAttribute("class"))`,
    );
    check(
      lit && redrawn && left.length === 0,
      "a picture redrawn under a resting pointer leaves nobody lit",
      { moment: id, lit, redrawn, left },
    );
  }

  // --- the first draw measured the box it ends up in ---------------------------
  // Sized to a box that then changes, the picture is wrong until the next
  // resize redraws it. So a resize straight after loading should find nothing
  // to do. This holds whatever width the picture has grown to.

  await load("river");
  {
    const width = `Number(document.querySelector("#origins-braid svg").getAttribute("width"))`;
    const first = await tab.evaluate<number>(width);
    await tab.evaluate(`window.dispatchEvent(new Event("resize"))`);
    await sleep(500);
    const settled = await tab.evaluate<number>(width);
    check(
      first === settled,
      "River: the picture is the right size on first load, not only after a resize",
      { first, afterResize: settled },
    );
    check(
      await tab.waitFor(
        `!document.getElementById("origins-legend").classList.contains("is-hidden")`,
      ),
      "the legend is shown once the picture is drawn",
    );
  }

  // --- the view opens in the middle of a picture wider than its box ------------
  // Beside the roster the box is 475px in a window this wide, and River is far
  // wider than that. Opened at its left edge it showed almost none of the
  // ribbon.

  await load("river", 1100, 1000);
  {
    const far = await reach();
    const at = await mapAt();
    check(
      far.x > 0 && Math.abs(at.left - far.x / 2) <= 1 && at.top === 0,
      "River wider than its box opens at the top, with as much out of sight on the left as on the right",
      { reach: far, at },
    );
  }

  // --- the toggle shows which mode is on ---------------------------------------

  {
    const colours = `[...document.querySelectorAll("[data-origins-mode]")].map((b) => getComputedStyle(b).backgroundColor)`;
    const settled = await tab.waitFor(`(() => { const c = ${colours}; return c[0] !== c[1]; })()`);
    const [on, off] = await tab.evaluate<string[]>(colours);
    check(settled, "toggle: River looks selected when River is showing", {
      river: on,
      subway: off,
    });

    const at = await centreOf(`[data-origins-mode="subway"]`);
    await tab.click(at.x, at.y);
    await tab.waitFor(`document.querySelector("#origins-braid svg.is-subway") !== null`, 15_000);
    // hover and focus tint a button too, so take both away before looking
    await tab.move(5, 5);
    await tab.evaluate(`document.activeElement.blur()`);
    const swapped = await tab.waitFor(
      `(() => { const c = ${colours}; return c[1] === ${JSON.stringify(on)} && c[0] === ${JSON.stringify(off)}; })()`,
    );
    check(
      swapped && on !== off,
      "toggle: Subway looks selected after switching, and River no longer does",
      await tab.evaluate(colours),
    );
  }

  // --- switching modes moves everything ----------------------------------------
  // The picture, its box and the roster's cards travel from one layout to the
  // other. Most of these press the button straight after loading, before the
  // page has laid out the other mode by itself, and the rest well after.

  await load("river");
  {
    const viewBox = `${PICTURE}.getAttribute("viewBox")`;
    const river = await tab.evaluate<string>(viewBox);
    await pressMode("subway");
    const moving = await tab.waitFor(MORPHING, 15_000);
    // Part way through, the picture is neither the one it left nor the one
    // it is going to.
    await sleep(500);
    const between = await tab.evaluate<{ box: string; moving: boolean }>(
      `({ box: ${viewBox}, moving: ${MORPHING} })`,
    );
    const stopped = moving && (await tab.waitFor(`!${MORPHING}`, 2500));
    const subway = await tab.evaluate<string>(viewBox);
    check(
      moving && between.moving && stopped && between.box !== river &&
        between.box !== subway,
      "switching modes: the map moves through pictures that are neither mode's, and stops within three seconds",
      { moving, stopped, river, between, subway },
    );
  }

  // A switch that fails part way ends in the ordinary picture for the mode
  // the page says it is in. Nothing in the page fails on its own, so the
  // check makes one setAttribute throw: on a picture already on screen, the
  // first frame of the journey; on one not yet in the page, the drawing of
  // the picture it is going to.
  for (const [when, onScreen] of [["while it moves", true], ["before it moves", false]] as const) {
    await load("river");
    await tab.evaluate(`(() => {
      const original = Element.prototype.setAttribute;
      window.__originsThrew = false;
      Element.prototype.setAttribute = function (name, value) {
        if (name === "viewBox" && this.isConnected === ${onScreen}) {
          Element.prototype.setAttribute = original;
          window.__originsThrew = true;
          throw new Error("a switch made to fail by the browser check");
        }
        return original.call(this, name, value);
      };
      return true;
    })()`);
    await pressMode("subway");
    const landed = await landedIn("subway");
    const threw = await tab.evaluate<boolean>(`window.__originsThrew === true`);
    const says = await tab.evaluate<string>(
      `document.getElementById("origins-layout").getAttribute("data-mode") + "," + ${MAP}.getAttribute("data-mode")`,
    );
    const left = await leftBehind();
    const after = await shape();
    const uncaught = [...tab.errors];
    await watchForMorph();
    await pressMode("river");
    const again = (await landedIn("river")) && (await morphed());
    await load("subway");
    const fresh = await shape();
    check(
      landed && threw && says === "subway,subway" && left.length === 0 && after === fresh &&
        again && uncaught.length === 0,
      `switching modes: a switch that fails ${when} ends in the ordinary Subway picture, and the next switch works`,
      { landed, threw, says, left, same: after === fresh, again, uncaught },
    );
  }

  await load("river");
  {
    const order = await listOrder();
    await watchForMorph();
    await pressMode("subway");
    const landed = await landedIn("subway");
    const moved = await morphed();
    const after = await shape();
    const left = await leftBehind();
    if ((await listOrder()) !== order) left.push("the cards are out of order in Subway");
    await load("subway");
    const fresh = await shape();
    check(
      landed && moved && after === fresh,
      "switching to Subway lands on the picture a fresh visit to Subway draws",
      { landed, moved, same: after === fresh },
    );

    await watchForMorph();
    await pressMode("river");
    const landedBack = await landedIn("river");
    const movedBack = await morphed();
    const back = await shape();
    left.push(...(await leftBehind()));
    if ((await listOrder()) !== order) left.push("the cards are out of order in River");
    await load("river");
    const freshRiver = await shape();
    check(
      landedBack && movedBack && back === freshRiver,
      "switching back to River lands on the picture a fresh visit to River draws",
      { landed: landedBack, moved: movedBack, same: back === freshRiver },
    );
    check(
      moved && movedBack && left.length === 0,
      "switching modes leaves nothing set on the map, the layout or the roster, and every card back in the roster",
      { moved, movedBack, left },
    );
  }

  await load("river");
  {
    // Where the first moment's card is on the page, not on screen, in case the
    // page scrolls while it moves.
    const first = `(() => {
      const e = ${MOMENTS}?.querySelector(".origins-moments-item");
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { x: b.left + scrollX, y: b.top + scrollY, position: getComputedStyle(e).position };
    })()`;
    type Place = { x: number; y: number; position: string } | null;
    const river = await tab.evaluate<Place>(first);
    await pressMode("subway");
    const moving = await tab.waitFor(MORPHING, 15_000);
    await sleep(500);
    const between = await tab.evaluate<Place>(first);
    const landed = await landedIn("subway");
    const subway = await tab.evaluate<Place>(first);
    const apart = (a: Place, b: Place) =>
      a !== null && b !== null && Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) > 1;
    check(
      moving && landed && between?.position === "absolute" && apart(between, river) &&
        apart(between, subway),
      "switching modes: a moment's card travels from its place in one arrangement to its place in the other",
      { moving, landed, river, between, subway },
    );
  }

  await load("river");
  {
    await pressMode("subway");
    const moving = await tab.waitFor(MORPHING, 15_000);
    await sleep(400);
    // A person's card on its way and in sight, somewhere off the map's box,
    // so what the click goes through to is not a moment or a face.
    const passing = await tab.evaluate<{ slug: string; x: number; y: number } | null>(`(() => {
      const m = ${MAP}.getBoundingClientRect();
      for (const item of ${ROSTER}.querySelectorAll(".origins-roster-item")) {
        if (getComputedStyle(item).position !== "absolute") continue;
        if (Number(getComputedStyle(item).opacity) < 0.5) continue;
        const b = item.getBoundingClientRect();
        const x = b.left + b.width / 2;
        const y = b.top + b.height / 2;
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
        if (x >= m.left && x <= m.right && y >= m.top && y <= m.bottom) continue;
        return { slug: item.querySelector(".origins-card").dataset.person, x, y };
      }
      return null;
    })()`);
    let during = false;
    if (passing !== null) {
      await tab.click(passing.x, passing.y);
      during = await tab.evaluate<boolean>(MORPHING);
    }
    const landed = await landedIn("subway");
    await tab.move(5, 5);
    await sleep(300);
    const left = await tab.evaluate<{ picked: number; lit: number }>(`({
      picked: document.querySelectorAll(".is-picked").length,
      lit: document.querySelectorAll(".is-lit").length,
    })`);
    // The same card, clicked once it is still, does pick: the click on the
    // way was not refused only because there is nothing to pick.
    const still = passing !== null && (await clickCard(PERSON_CARD(passing.slug))) &&
      (await tab.evaluate<boolean>(has(PERSON_CARD(passing.slug), "is-picked")));
    check(
      moving && passing !== null && during && landed && left.picked === 0 && left.lit === 0 &&
        still,
      "switching modes: a click where a card is passing picks nothing",
      { moving, passing, during, landed, ...left, still },
    );
  }

  await load("river");
  {
    const was = await tab.evaluate<number | null>(`(() => {
      const list = ${MOMENTS};
      if (list === null) return null;
      list.scrollTop = 200;
      return list.scrollTop;
    })()`);
    await watchForMorph();
    await pressMode("subway");
    const landed = await landedIn("subway");
    const moved = await morphed();
    const is = await tab.evaluate<number | null>(`${MOMENTS}?.scrollTop ?? null`);
    check(
      landed && moved && was === 200 && is !== null && Math.abs(is - 200) <= 1,
      "switching modes: a list scrolled part way down is where it was after the switch",
      { landed, moved, was, is },
    );
  }

  {
    const missed: unknown[] = [];
    let movedEvery = true;
    for (const [where, share] of [["start", 0], ["middle", 0.5], ["end", 1]] as const) {
      await load("river");
      await watchForMorph();
      const from = await reach();
      await tab.evaluate(`${MAP}.scrollTop = ${share * from.y}`);
      const was = await mapAt();
      await pressMode("subway");
      const landed = await landedIn("subway");
      movedEvery &&= landed && (await morphed());
      const to = await reach();
      const is = await mapAt();
      const along = from.y === 0 ? 0 : was.top / from.y;
      const across = from.x === 0 ? 0.5 : was.left / from.x;
      const want = { left: along * to.x, top: across * to.y };
      if (
        from.y === 0 || to.x === 0 ||
        Math.abs(is.left - want.left) > 1 || Math.abs(is.top - want.top) > 1
      ) {
        missed.push({ where, from, was, to, is, want });
      }
    }
    check(
      movedEvery && missed.length === 0,
      "switching modes lands the same share of the way along the other map, from its start, its middle and its end",
      { moved: movedEvery, missed },
    );
  }

  await load("river");
  {
    // After the page has laid out the other mode by itself.
    await sleep(2500);
    await watchForMorph();
    const from = await reach();
    await tab.evaluate(`${MAP}.scrollTop = ${Math.round(0.37 * from.y)}`);
    const was = await mapAt();
    await pressMode("subway");
    const there = await landedIn("subway");
    const between = await mapAt();
    await pressMode("river");
    const back = await landedIn("river");
    const moved = await morphed();
    const is = await mapAt();
    check(
      there && back && moved && was.top > 0 &&
        Math.abs(is.left - was.left) <= 1 && Math.abs(is.top - was.top) <= 1,
      "switching to Subway and back returns the map to where it was",
      { moved, was, between, is },
    );
  }

  await load("river");
  {
    const fit = await zoomButton("fit");
    await tab.click(fit.x, fit.y);
    const whole = `${MAP}.scrollHeight <= ${MAP}.clientHeight && ${MAP}.scrollWidth <= ${MAP}.clientWidth`;
    await tab.waitFor(whole);
    await watchForMorph();
    await pressMode("subway");
    const landed = await landedIn("subway");
    const moved = await morphed();
    const fitted = await tab.evaluate<boolean>(whole);
    const width = await tab.evaluate<number>(pictureWidth);
    const again = await zoomButton("fit");
    await tab.click(again.x, again.y);
    await sleep(300);
    const refitted = await tab.evaluate<number>(pictureWidth);
    check(
      landed && moved && fitted && Math.abs(refitted - width) < 0.5,
      "switching modes: a fitted view arrives fitted, with nothing to scroll to and nothing for Fit to do",
      {
        moved,
        fitted,
        width,
        afterFit: refitted,
        scroll: await tab.evaluate(`[${MAP}.scrollWidth, ${MAP}.scrollHeight]`),
        box: await tab.evaluate(`[${MAP}.clientWidth, ${MAP}.clientHeight]`),
      },
    );
  }

  await load("river");
  {
    await pressMode("subway");
    const moving = await tab.waitFor(MORPHING, 15_000);
    await pressMode("river");
    const landed = await landedIn("subway");
    await sleep(300);
    const still = await tab.evaluate<boolean>(
      `${PICTURE}.classList.contains("is-subway") && !${MORPHING}`,
    );
    const pressed = await tab.evaluate<string[]>(
      `[...document.querySelectorAll("[data-origins-mode]")].map((b) => b.dataset.originsMode + ":" + b.getAttribute("aria-pressed"))`,
    );
    check(
      moving && landed && still && pressed.includes("subway:true") &&
        pressed.includes("river:false"),
      "switching modes: pressing the other mode while the map moves changes nothing",
      { moving, landed, still, pressed },
    );
  }

  await load("river");
  {
    // Fit pressed on the way. The landing sets the zoom it worked out before
    // the press, so the zoom alone would not show a press that got through;
    // the switch after it would, arriving fitted.
    await pressMode("subway");
    const moving = await tab.waitFor(MORPHING, 15_000);
    const fit = await zoomButton("fit");
    await tab.click(fit.x, fit.y);
    const landed = await landedIn("subway");
    const says = `document.querySelector('[data-origins-zoom="reset"]').getAttribute("aria-disabled")`;
    const at100 = `Math.abs(${pictureWidth} - ${drawnWidth}) < 0.5 && ${says} === "true"`;
    const there = await tab.evaluate<boolean>(at100);
    await pressMode("river");
    const back = await landedIn("river");
    const stillAt100 = await tab.evaluate<boolean>(at100);
    check(
      moving && landed && there && back && stillAt100,
      "switching modes: the zoom buttons do nothing while the map moves",
      {
        moving,
        landed,
        there,
        back,
        stillAt100,
        width: await tab.evaluate(pictureWidth),
        drawn: await tab.evaluate(drawnWidth),
      },
    );
  }

  {
    // River is centred in a box wider than it is, so a narrower box draws it
    // differently. That needs a River that fits the wider box: the widest the
    // page gives it is 859px, from a window of 1408px up. The history decides
    // how wide River is, and once it is wider than that the two pictures are
    // the same and this says so.
    await load("river", 1400, 1000);
    const narrow = await shape();
    await load("river", 1500, 1000);
    const wide = await shape();
    await load("subway", 1500, 1000);
    await pressMode("river");
    const moving = await tab.waitFor(MORPHING, 15_000);
    await tab.size(1400, 1000);
    const landed = await landedIn("river");
    await sleep(600);
    const after = await shape();
    check(
      moving && landed && narrow !== wide && after === narrow,
      "switching modes: a window narrowed while the map moves ends with the picture a fresh visit at that width draws",
      { moving, landed, narrowDiffers: narrow !== wide, same: after === narrow },
    );
  }

  await tab.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await load("river");
  {
    await watchForMorph();
    await pressMode("subway");
    const arrived = await tab.waitFor(`${PICTURE}.classList.contains("is-subway")`, 15_000);
    const moved = await morphed();
    check(
      arrived && !moved,
      "with reduced motion asked for, switching modes is instant",
      { arrived, moved },
    );
  }
  await load("river");
  {
    const from = await reach();
    await tab.evaluate(`${MAP}.scrollTop = ${Math.round(0.5 * from.y)}`);
    const was = await mapAt();
    await pressMode("subway");
    const arrived = await tab.waitFor(`${PICTURE}.classList.contains("is-subway")`, 15_000);
    const to = await reach();
    const is = await mapAt();
    const want = from.y === 0 ? 0 : (was.top / from.y) * to.x;
    check(
      arrived && from.y > 0 && to.x > 0 && Math.abs(is.left - want) <= 1,
      "with reduced motion asked for, a switch lands the same share of the way along the other map",
      { from, was, to, is, want },
    );
  }
  await load("river");
  {
    const story = await storyOf();
    const far = await furthest(Object.fromEntries(peopled(story).map((id) => [id, OVAL(id)])));
    const id = far?.id ?? "";
    const clicked = await clickCard(MOMENT_CARD(id));
    // No wait: the map is to be there already.
    const where = await centredIn(OVAL(id));
    check(
      far !== null && far.off > 50 && clicked && where.ok,
      "with reduced motion asked for, a click on a card puts the map there at once",
      { moment: id, off: far?.off, clicked, where },
    );
  }
  await load("subway");
  {
    const id = await momentPastItsList();
    let middle: ({ ok: boolean } & Record<string, unknown>) | null = null;
    if (id !== null) {
      const at = await centreOf(OVAL(id));
      await tab.click(at.x, at.y);
      // No wait: the list is to be there already.
      middle = await midList(MOMENT_CARD(id), MOMENTS);
    }
    check(
      id !== null && middle?.ok === true,
      "with reduced motion asked for, a click on a moment in the map puts its card in the middle of its list at once",
      { moment: id, middle },
    );
  }
  await tab.send("Emulation.setEmulatedMedia", { features: [] });
  if (await tab.evaluate<boolean>(`matchMedia("(prefers-reduced-motion: reduce)").matches`)) {
    throw new Error("reduced motion is still asked for after the check that asked for it");
  }

  // --- cards and focus ----------------------------------------------------------
  // The popup's own checks run in Subway, where the lists are under the map
  // and a click in the map opens it.

  await load("subway");
  {
    const dot = await centreOf(SIDE_DOT);
    await tab.click(dot.x, dot.y);
    const opened = await tab.waitFor(popupOpen);
    await tab.evaluate(`window.scrollTo(0, document.documentElement.scrollHeight)`);
    await sleep(200);
    const before = (await scrolled()).page;
    // somewhere on screen that is not a link, a button, the map or the roster
    const blank = await tab.evaluate<Point | null>(`(() => {
      for (let y = innerHeight - 10; y > 10; y -= 20) {
        for (let x = 10; x < innerWidth - 20; x += 20) {
          const e = document.elementFromPoint(x, y);
          if (e && !e.closest("a, button, input, [role=button], .origins-popup, #origins-braid, #origins-roster")) return { x, y };
        }
      }
      return null;
    })()`);
    if (blank === null) throw new Error("no empty spot on the page to click");
    await tab.click(blank.x, blank.y);
    const closed = await tab.waitFor(popupShut);
    await sleep(300);
    const after = (await scrolled()).page;
    check(
      opened && closed && before === after,
      "card: clicking empty page closes it without moving the page",
      { opened, closed, before, after },
    );
  }

  // A click on a person's card in the list closes it already. A moment's card
  // carries its moment's id as the map's pills do, and a click on a pill swaps
  // the card rather than closing it.
  await load("subway");
  {
    const dot = await centreOf(SIDE_DOT);
    await tab.click(dot.x, dot.y);
    const opened = await tab.waitFor(popupOpen);
    const card = "#origins-roster .origins-detail-card";
    const there = await tab.evaluate<boolean>(`document.querySelector(${JSON.stringify(card)}) !== null`);
    let closed = false;
    if (there) {
      // Off its links: the card holds them now, and a click on one is the link's.
      await clickCard(card);
      closed = await tab.waitFor(popupShut);
    }
    check(
      opened && there && closed,
      "a click on a moment's card in the list closes a card open in the map",
      { opened, there, closed },
    );
  }

  await load("subway");
  {
    let inBraid = false;
    for (let presses = 0; presses < 60 && !inBraid; presses += 1) {
      await tab.key("Tab");
      inBraid = await tab.evaluate(
        `/origins-(root|node)/.test(document.activeElement.getAttribute("class") || "")`,
      );
    }
    await tab.key("ArrowDown");
    await tab.evaluate(`window.__opener = document.activeElement`);
    await tab.key("Enter");
    const inCard = await tab.waitFor(`${POPUP}.contains(document.activeElement)`);
    await tab.key("Escape");
    const closed = await tab.waitFor(popupShut);
    const back = await tab.evaluate<boolean>(
      `document.activeElement === window.__opener`,
    );
    check(
      inBraid && inCard && closed && back,
      "card: opened by keyboard, Escape returns focus to the dot that opened it",
      { inBraid, inCard, closed, back },
    );

    const dot = await centreOf(SIDE_DOT);
    await tab.click(dot.x, dot.y);
    await tab.waitFor(popupOpen);
    const x = await tab.evaluate<Point>(`(() => {
      const b = ${POPUP}.querySelector("[data-origins-dismiss]").getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    })()`);
    await tab.click(x.x, x.y);
    const shut = await tab.waitFor(popupShut);
    const onDot = await tab.evaluate<boolean>(
      `document.activeElement === document.querySelector(${JSON.stringify(SIDE_DOT)})`,
    );
    check(
      shut && onDot,
      "card: closing with the X leaves focus on the dot it belonged to",
      { shut, onDot },
    );
  }

  await load("river");
  {
    const story = await storyOf();
    const someone = peopled(story);
    await tab.move(5, 5);
    let inBraid = false;
    for (let presses = 0; presses < 60 && !inBraid; presses += 1) {
      await tab.key("Tab");
      inBraid = await tab.evaluate(
        `/origins-(root|node)/.test(document.activeElement.getAttribute("class") || "")`,
      );
    }
    // On to a moment someone was at.
    const on = `(document.activeElement.matches("#origins-braid .origins-node") ? document.activeElement.dataset.moment : null)`;
    let id: string | null = null;
    for (let presses = 0; presses < 60 && inBraid; presses += 1) {
      const at = await tab.evaluate<string | null>(on);
      if (at !== null && someone.includes(at)) {
        id = at;
        break;
      }
      await tab.key("ArrowDown");
    }
    let after: Record<string, unknown> = {};
    let ok = false;
    if (id !== null) {
      const want = cameTo(story, id);
      await tab.evaluate(`window.__opener = document.activeElement`);
      await tab.key("Enter");
      await sleep(300);
      const marked = await tab.evaluate<
        { opened: boolean; pill: boolean; card: boolean; threads: string[]; onCard: boolean }
      >(`({
        opened: ${popupOpen},
        pill: ${has(PILL(id), "is-picked")},
        card: ${has(MOMENT_CARD(id), "is-picked")},
        threads: ${LIT_PEOPLE},
        onCard: document.activeElement === document.querySelector(${JSON.stringify(MOMENT_CARD(id))}),
      })`);
      await tab.key("Escape");
      await sleep(300);
      const released = await tab.evaluate<{ picked: number; back: boolean }>(`({
        picked: document.querySelectorAll(".is-picked").length,
        back: document.activeElement === window.__opener,
      })`);
      // Somewhere else the reader went after Enter keeps their focus.
      await tab.key("Enter");
      await sleep(300);
      await tab.evaluate(`(window.__elsewhere = document.querySelector("[data-origins-zoom]"), window.__elsewhere.focus(), true)`);
      await tab.key("Escape");
      await sleep(300);
      const stayed = await tab.evaluate<boolean>(`document.activeElement === window.__elsewhere`);
      // Away from the card and back into it, on a link of its own, is a
      // place the reader chose too.
      const linked = await tab.evaluate<string | null>(`(() => {
        const c = [...document.querySelectorAll("#origins-roster .origins-detail-card")].find((c) =>
          c.querySelector("a") !== null &&
          document.querySelector('#origins-braid .origins-node[data-moment="' + c.dataset.moment + '"]') !== null
        );
        return c?.dataset.moment ?? null;
      })()`);
      let returned: Record<string, unknown> = { linked };
      if (linked !== null) {
        await tab.evaluate(`(document.querySelector(${JSON.stringify(PILL(linked))}).focus(), true)`);
        await tab.key("Enter");
        await sleep(300);
        const sent = await tab.evaluate<boolean>(
          `document.activeElement === document.querySelector(${JSON.stringify(MOMENT_CARD(linked))})`,
        );
        await tab.evaluate(`(document.querySelector("[data-origins-zoom]").focus(), true)`);
        await tab.evaluate(`(window.__link = document.querySelector(${JSON.stringify(`${MOMENT_CARD(linked)} a`)}), window.__link.focus(), true)`);
        await tab.key("Escape");
        await sleep(300);
        const onLink = await tab.evaluate<boolean>(`document.activeElement === window.__link`);

        // A click on the page that takes no focus is leaving the card too.
        await tab.evaluate(`(document.querySelector(${JSON.stringify(PILL(linked))}).focus(), true)`);
        await tab.key("Enter");
        await sleep(300);
        const sentAgain = await tab.evaluate<boolean>(
          `document.activeElement === document.querySelector(${JSON.stringify(MOMENT_CARD(linked))})`,
        );
        const blank = await tab.evaluate<Point | null>(`(() => {
          window.scrollTo(0, document.documentElement.scrollHeight);
          for (let y = innerHeight - 10; y > 10; y -= 20) {
            for (let x = 10; x < innerWidth - 20; x += 20) {
              const e = document.elementFromPoint(x, y);
              if (e && !e.closest("a, button, input, [role=button], [tabindex], .origins-popup, #origins-braid, #origins-roster")) return { x, y };
            }
          }
          return null;
        })()`);
        if (blank !== null) await tab.click(blank.x, blank.y);
        const leftCard = await tab.evaluate<boolean>(
          `!document.querySelector(${JSON.stringify(MOMENT_CARD(linked))}).contains(document.activeElement)`,
        );
        await tab.evaluate(`(window.__link.focus({ preventScroll: true }), true)`);
        await tab.key("Escape");
        await sleep(300);
        returned = {
          linked,
          sent,
          onLink,
          sentAgain,
          blank,
          leftCard,
          onLinkAfterBlank: await tab.evaluate<boolean>(`document.activeElement === window.__link`),
        };
      }
      after = { want, ...marked, ...released, stayed, ...returned };
      ok = !marked.opened && marked.pill && marked.card && want.length > 0 &&
        JSON.stringify(marked.threads) === JSON.stringify(want) && marked.onCard &&
        released.picked === 0 && released.back && stayed &&
        linked !== null && returned.sent === true && returned.onLink === true &&
        returned.sentAgain === true && returned.blank !== null && returned.leftCard === true &&
        returned.onLinkAfterBlank === true;
    }
    check(
      inBraid && id !== null && ok,
      "beside the map, Enter on a moment picks it, moves focus to its card in the list, and Escape sends focus back",
      { inBraid, moment: id, ...after },
    );
  }

  // --- every dot answers the pointer ---------------------------------------------

  await load("river");
  {
    const stroke = `getComputedStyle(document.querySelector(${JSON.stringify(`${SIDE_DOT} .origins-oval`)})).stroke`;
    const dot = await centreOf(SIDE_DOT);
    await tab.move(5, 5);
    await sleep(200);
    const rest = await tab.evaluate<string>(stroke);
    await tab.move(dot.x, dot.y);
    check(
      await tab.waitFor(`${stroke} !== ${JSON.stringify(rest)}`),
      "a side moment's oval changes its outline when the pointer is over it",
      { rest, hover: await tab.evaluate(stroke) },
    );
    // Beside the map nothing opens, and the pick alone outlines it.
    await tab.click(dot.x, dot.y);
    await tab.move(5, 5);
    await sleep(300);
    const picked = await tab.evaluate<string>(stroke);
    check(picked !== rest, "beside the map, a picked moment's oval keeps its changed outline", {
      rest,
      picked,
    });
  }

  await load("subway");
  {
    const stroke = `getComputedStyle(document.querySelector(${JSON.stringify(`${SIDE_DOT} .origins-oval`)})).stroke`;
    const dot = await centreOf(SIDE_DOT);
    await tab.move(5, 5);
    await sleep(200);
    const rest = await tab.evaluate<string>(stroke);
    await tab.click(dot.x, dot.y);
    await tab.waitFor(popupOpen);
    await tab.move(5, 5);
    await sleep(300);
    const open = await tab.evaluate<string>(stroke);
    check(open !== rest, "a side moment's oval keeps a changed outline while its card is open", {
      rest,
      open,
    });
  }

  // --- a moment's avatar answers for its moment -----------------------------------
  // An event's own mark, beside its oval. A click on it opens the card the
  // oval opens, in the place the oval opens it, and it travels with
  // everything else when the mode changes. Both need a moment in the history
  // that carries one.

  // A window wide enough that the card has room to open on the right of the
  // moment. Where it has room on neither side it is held on screen, in the
  // same place whatever was clicked, and that would show nothing. In Subway,
  // where the lists are under the map and the card opens.
  await load("subway", 1700, 1000);
  {
    // the moment with an avatar whose oval is furthest left
    const id = await tab.evaluate<string | null>(`(() => {
      const left = (id) => document.querySelector('#origins-braid .origins-node[data-moment="' + id + '"] .origins-oval').getBoundingClientRect().left;
      const ids = [...document.querySelectorAll("#origins-braid .origins-moment-avatar")].map((a) => a.dataset.moment);
      return ids.sort((a, b) => left(a) - left(b))[0] ?? null;
    })()`);
    const node = `document.querySelector('#origins-braid .origins-node[data-moment="${id}"]')`;
    const card = `(() => {
      const c = ${POPUP};
      return {
        at: c.style.left + " " + c.style.top,
        left: c.getBoundingClientRect().left,
        title: c.querySelector(".origins-detail-title")?.textContent ?? "",
      };
    })()`;
    type Card = { at: string; left: number; title: string };
    let byOval: Card | null = null;
    let byAvatar: Card | null = null;
    let ovalRight = 0;
    let marked = false;
    if (id !== null) {
      const oval = await centreOf(`.origins-node[data-moment="${id}"] .origins-oval`);
      await tab.click(oval.x, oval.y);
      await tab.waitFor(popupOpen);
      byOval = await tab.evaluate<Card>(card);
      ovalRight = await tab.evaluate<number>(`${node}.getBoundingClientRect().right`);
      await tab.key("Escape");
      await tab.waitFor(`!(${popupOpen})`);

      // Where the avatar is now, without scrolling to it: the two cards are
      // only in the same place if the map has not moved between them.
      const avatar = await tab.evaluate<Point>(`(() => {
        const b = document.querySelector('#origins-braid .origins-moment-avatar[data-moment="${id}"]').getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
      })()`);
      await tab.click(avatar.x, avatar.y);
      await tab.waitFor(popupOpen);
      byAvatar = await tab.evaluate<Card>(card);
      marked = await tab.evaluate<boolean>(`${node}.classList.contains("is-open")`);
    }
    check(
      byOval !== null && byAvatar !== null && byOval.title !== "" &&
        // the card opened on the moment's right
        byOval.left > ovalRight &&
        byAvatar.at === byOval.at && byAvatar.title === byOval.title && marked,
      "a moment's avatar opens its moment's card, in the place a click on the moment opens it",
      { moment: id, ovalRight, byOval, byAvatar, marked },
    );
  }

  await load("river");
  {
    const at = `document.querySelector("#origins-braid .origins-moment-avatar")?.getAttribute("transform") ?? null`;
    const river = await tab.evaluate<string | null>(at);
    await pressMode("subway");
    const moving = await tab.waitFor(MORPHING, 15_000);
    await sleep(500);
    const between = await tab.evaluate<{ at: string | null; moving: boolean }>(
      `({ at: ${at}, moving: ${MORPHING} })`,
    );
    const landed = await landedIn("subway");
    const subway = await tab.evaluate<string | null>(at);
    check(
      river !== null && moving && between.moving && landed && between.at !== river &&
        between.at !== subway && river !== subway,
      "switching modes: a moment's avatar travels between its two places with everything else",
      { moving, landed, river, between, subway },
    );
  }

  // In River a moment's avatar stands before its label's text. The room the
  // layout keeps for a title is not the width the title is drawn at, and an
  // avatar set by the room stood 8px from a short title and 33px from a long
  // one. Only a browser knows how wide the text really came out.
  await load("river");
  {
    const gaps = await tab.evaluate<Array<{ moment: string; gap: number }>>(`(() => {
      const svg = ${PICTURE};
      const labels = [...svg.querySelectorAll("text.origins-label")].map((t) => t.getBoundingClientRect());
      return [...svg.querySelectorAll(".origins-moment-avatar")].map((a) => {
        const box = a.getBoundingClientRect();
        const row = box.top + box.height / 2;
        // its own label: the one on its row, each moment having a row to itself
        const off = (b) => Math.abs(b.top + b.height / 2 - row);
        const label = labels.reduce((best, b) => (off(b) < off(best) ? b : best));
        return { moment: a.dataset.moment, gap: Math.round((label.left - box.right) * 10) / 10 };
      });
    })()`);
    const all = gaps.map((g) => g.gap);
    check(
      gaps.length > 0 && Math.min(...all) > 0 && Math.max(...all) - Math.min(...all) <= 1,
      "River: every moment's avatar stands the same distance from its label's text",
      gaps,
    );
  }

  // --- no label is cut off --------------------------------------------------------

  const labels = `[...document.querySelectorAll("#origins-braid .origins-label")]`;
  for (
    const [mode, width, phone] of [
      ["river", 390, true],
      ["river", 1400, false],
      ["subway", 390, true],
    ] as const
  ) {
    await load(mode, width, 900, phone);
    const cut = await tab.evaluate<unknown[]>(`(() => {
      const canvas = Number(document.querySelector("#origins-braid svg").getAttribute("width"));
      return ${labels}
        .map((t) => { const b = t.getBBox(); return [t.textContent, Math.round(b.x), Math.round(b.x + b.width)]; })
        .filter((l) => l[1] < 0 || l[2] > canvas);
    })()`);
    check(
      cut.length === 0,
      `${mode} at ${width}px: every label is inside the picture`,
      cut,
    );
  }
  {
    await load("river");
    const wide = await tab.evaluate<unknown[]>(
      `${labels}.map((t) => [t.textContent, Math.round(t.getComputedTextLength())]).filter((l) => l[1] > ${LABEL_MAX})`,
    );
    check(
      wide.length === 0,
      `no label is drawn wider than the ${LABEL_MAX}px the layout reserved for it`,
      wide,
    );
  }

  // --- the layout engine fails to arrive -------------------------------------------

  {
    await load("river");
    const cards = `[
      document.querySelectorAll("#origins-roster .origins-roster .origins-card").length,
      document.querySelectorAll("#origins-roster .origins-moments .origins-detail-card").length,
    ]`;
    const everyone = await tab.evaluate<number[]>(cards);
    await tab.send("Network.setCacheDisabled", { cacheDisabled: true });
    await tab.send("Network.setBlockedURLs", { urls: ["*elk.bundled.js*"] });
    await tab.goto(page);
    const said = await tab.waitFor(
      `${MAP}.innerText.trim().length > 0 && document.querySelector("#origins-braid svg") === null`,
    );
    const roster = await tab.evaluate<number[]>(cards);
    check(
      everyone.every((n) => n > 0) && JSON.stringify(roster) === JSON.stringify(everyone),
      "without the layout engine, the people and the moments are still listed",
      { withIt: everyone, withoutIt: roster },
    );
    check(said, "without the layout engine, the empty map says so");
    check(
      await tab.evaluate<boolean>(
        `document.getElementById("origins-toggle").classList.contains("is-hidden")`,
      ),
      "without the layout engine, the toggle that would do nothing stays hidden",
    );
    check(
      await tab.evaluate<boolean>(
        `document.getElementById("origins-zoom").classList.contains("is-hidden")`,
      ),
      "without the layout engine, the zoom with nothing to zoom stays hidden",
    );
    check(
      await tab.evaluate<boolean>(
        `document.getElementById("origins-legend").classList.contains("is-hidden")`,
      ),
      "without the layout engine, the legend for a picture that is not there stays hidden",
    );
    check(
      tab.errors.length === 0,
      "without the layout engine, nothing is thrown uncaught",
      tab.errors,
    );
    await tab.send("Network.setBlockedURLs", { urls: [] });
    await tab.send("Network.setCacheDisabled", { cacheDisabled: false });
  }

  // --- zoom ------------------------------------------------------------------------------

  await load("river");
  {
    check(
      await tab.waitFor(
        `!document.getElementById("origins-zoom").classList.contains("is-hidden")`,
      ),
      "the zoom is shown once the picture is drawn",
    );

    // The middle of the box as the page reckons it, which leaves out the
    // room kept for a scrollbar.
    const held = await tab.evaluate<Point>(`(() => {
      const b = ${MAP}.getBoundingClientRect();
      return { x: b.left + ${MAP}.clientWidth / 2, y: b.top + ${MAP}.clientHeight / 2 };
    })()`);
    const before = await onPicture(held);
    const plus = await zoomButton("in");
    await tab.click(plus.x, plus.y);
    const grew = await tab.waitFor(`${pictureWidth} > ${before.width} * 1.2`);
    const after = await onPicture(held);
    check(
      grew && Math.abs(after.width / before.width - 1.25) < 0.01 && slid(before, after) < 2,
      "zoom: + makes the picture a quarter larger and keeps the middle of the map where it was",
      { grew, from: before.width, to: after.width, slid: slid(before, after) },
    );

    // Ctrl and the wheel, somewhere that is not the middle, so that holding
    // the pointer's place and holding the middle's are different things. The
    // box is brought on screen first: a wheel below the fold goes nowhere.
    const pointer = await tab.evaluate<Point>(`(() => {
      ${MAP}.scrollIntoView({ block: "center" });
      const b = ${MAP}.getBoundingClientRect();
      return { x: b.left + ${MAP}.clientWidth * 0.3, y: b.top + ${MAP}.clientHeight * 0.7 };
    })()`);
    const pageBefore = (await scrolled()).page;
    const under = await onPicture(pointer);
    await tab.wheel(pointer.x, pointer.y, -100, true);
    const wheeled = await tab.waitFor(`${pictureWidth} > ${under.width} * 1.1`);
    const underAfter = await onPicture(pointer);
    check(
      wheeled && slid(under, underAfter) < 2 && (await scrolled()).page === pageBefore,
      "zoom: Ctrl and the wheel zoom in about the pointer, and the page stays where it is",
      {
        wheeled,
        from: under.width,
        to: underAfter.width,
        slid: slid(under, underAfter),
        page: [pageBefore, (await scrolled()).page],
      },
    );

    const fit = await zoomButton("fit");
    await tab.click(fit.x, fit.y);
    const whole = `${MAP}.scrollHeight <= ${MAP}.clientHeight && ${MAP}.scrollWidth <= ${MAP}.clientWidth`;
    check(
      await tab.waitFor(whole),
      "zoom: Fit shows the whole of River with nothing left to scroll to",
      await tab.evaluate(
        `({ scroll: [${MAP}.scrollWidth, ${MAP}.scrollHeight], box: [${MAP}.clientWidth, ${MAP}.clientHeight] })`,
      ),
    );

    const reset = await zoomButton("reset");
    const says = `document.querySelector('[data-origins-zoom="reset"]').getAttribute("aria-disabled")`;
    const live = await tab.evaluate<string>(says);
    await tab.click(reset.x, reset.y);
    const back = await tab.waitFor(`Math.abs(${pictureWidth} - ${drawnWidth}) < 0.5`);
    check(
      back && live === "false" && (await tab.evaluate<string>(says)) === "true",
      "zoom: 100% puts the picture back at the size it was drawn, and then says it has nothing to do",
      { back, whileZoomed: live, at100: await tab.evaluate(says) },
    );
  }

  await load("subway");
  {
    const fit = await zoomButton("fit");
    await tab.click(fit.x, fit.y);
    const whole = `${MAP}.scrollHeight <= ${MAP}.clientHeight && ${MAP}.scrollWidth <= ${MAP}.clientWidth`;
    check(
      await tab.waitFor(whole),
      "zoom: Fit shows the whole of Subway with nothing left to scroll to",
      await tab.evaluate(
        `({ scroll: [${MAP}.scrollWidth, ${MAP}.scrollHeight], box: [${MAP}.clientWidth, ${MAP}.clientHeight] })`,
      ),
    );

    const reset = await zoomButton("reset");
    await tab.click(reset.x, reset.y);
    await tab.waitFor(`Math.abs(${pictureWidth} - ${drawnWidth}) < 0.5`);
    await tab.evaluate(`${MAP}.scrollIntoView({ block: "center" })`);
    const from = await insideMap(0.5);
    const start = await mapAt();
    await tab.pull(from.x, from.y, from.x - 300, from.y);
    const moved = await tab.waitFor(`${MAP}.scrollLeft >= ${start.left + 290}`);
    check(
      moved,
      "grab: in Subway a pressed mouse moves the map sideways with it",
      { from: start, to: await mapAt() },
    );
  }

  // --- grab ------------------------------------------------------------------------------

  await load("river");
  {
    await tab.evaluate(`${MAP}.scrollIntoView({ block: "start" })`);
    // far enough down that the pull stays inside the box
    const empty = await emptyMap(250);
    if (empty === null) throw new Error("no empty spot on the map to take hold of");
    const start = await mapAt();
    await tab.pull(empty.x, empty.y, empty.x, empty.y - 200);
    const moved = await tab.waitFor(`${MAP}.scrollTop >= ${start.top + 190}`);
    await sleep(200);
    check(
      moved && (await tab.evaluate<boolean>(popupShut)) &&
        !(await tab.evaluate<boolean>(`${MAP}.classList.contains("is-grabbing")`)),
      "grab: a pressed mouse moves the map with it, and lets go of it when released",
      { from: start, to: await mapAt() },
    );
  }

  // In Subway, where the lists are under the map and a click in the map
  // opens the card, so a drag that opened one would show. The map moves
  // sideways there.
  await load("subway");
  {
    await tab.evaluate(`${MAP}.scrollIntoView({ block: "start" })`);
    // Starting on a moment and ending on whatever is there: the map moves
    // and no card opens, for the one pressed or the one let go over.
    const dot = await centreOf(SIDE_DOT);
    const dotStart = await mapAt();
    await tab.pull(dot.x, dot.y, dot.x - 150, dot.y);
    const dragged = await tab.waitFor(`${MAP}.scrollLeft >= ${dotStart.left + 140}`);
    await sleep(300);
    check(
      dragged && (await tab.evaluate<boolean>(popupShut)),
      "grab: a drag that starts on a moment moves the map and does not open its card",
      { from: dotStart, to: await mapAt(), cardOpen: await tab.evaluate(popupOpen) },
    );
    // The press lit the moment's people. Holding the map takes the pointer
    // from the moment, and it has to hear that it left.
    await tab.move(5, 5);
    await sleep(300);
    const lit = await tab.evaluate<number>(`document.querySelectorAll(".is-lit").length`);
    check(lit === 0, "grab: nobody is left lit, or dimmed, after a drag that started on a moment", {
      lit,
    });

    // A card that is open stays open while the map is moved under it.
    const again = await centreOf(SIDE_DOT);
    await tab.click(again.x, again.y);
    const opened = await tab.waitFor(popupOpen);
    const hold = await emptyMap(20);
    if (hold === null) throw new Error("no empty spot on the map beside the open card");
    const cardStart = await mapAt();
    await tab.pull(hold.x, hold.y, hold.x - 60, hold.y);
    const carried = await tab.waitFor(`${MAP}.scrollLeft >= ${cardStart.left + 50}`);
    await sleep(300);
    check(
      opened && carried && (await tab.evaluate<boolean>(popupOpen)),
      "grab: moving the map leaves an open card open",
      { opened, from: cardStart, to: await mapAt(), cardOpen: await tab.evaluate(popupOpen) },
    );
  }

  // --- touch, the dark theme, and a mouse ------------------------------------------------

  await load("river", 390, 844, true);
  {
    const story = await storyOf();
    const id = await tab.evaluate<string>(
      `document.querySelector(${JSON.stringify(SIDE_DOT)}).dataset.moment`,
    );
    const want = cameTo(story, id);
    const dot = await centreOf(SIDE_DOT);
    await tab.tap(dot.x, dot.y);
    const opened = await tab.waitFor(popupOpen);
    await sleep(300);
    const picked = await tab.evaluate<boolean>(has(PILL(id), "is-picked"));
    // Everything lit is someone confirmed there, and everyone confirmed
    // there is lit.
    const lit = await tab.evaluate<Array<string | null>>(
      `[...document.querySelectorAll(".is-lit")].map((e) => e.getAttribute("data-person"))`,
    );
    const strays = lit.filter((slug) => slug === null || !want.includes(slug));
    const people = [...new Set(lit)].sort();
    await tab.evaluate(`${MAP}.scrollIntoView({ block: "start" })`);
    const empty = await emptyMap(20);
    if (empty !== null) await tab.tap(empty.x, empty.y);
    await sleep(300);
    const left = await tab.evaluate<number>(
      `document.querySelectorAll(".is-lit, .is-picked").length`,
    );
    check(
      opened && picked && want.length > 0 && strays.length === 0 &&
        JSON.stringify(people) === JSON.stringify(want) && empty !== null && left === 0,
      "touch: a tap opens the card and picks the moment, and nothing is left lit once it is let go",
      { moment: id, opened, picked, want, people, strays, tappedEmpty: empty !== null, left },
    );
  }

  await load("river");
  {
    const scheme = `getComputedStyle(${MAP}).colorScheme`;
    await tab.evaluate(`document.documentElement.setAttribute("data-theme", "dark")`);
    check(
      await tab.waitFor(`${scheme} === "dark"`),
      "dark theme: the map's own scrollbars are drawn dark",
      await tab.evaluate(scheme),
    );
    await tab.evaluate(`document.documentElement.setAttribute("data-theme", "light")`);
    check(
      await tab.waitFor(`${scheme} !== "dark"`),
      "light theme: they are not",
      await tab.evaluate(scheme),
    );
    await tab.evaluate(`document.documentElement.removeAttribute("data-theme")`);

    const dot = await centreOf(SIDE_DOT);
    await tab.move(dot.x, dot.y);
    check(
      await tab.waitFor(`document.querySelectorAll(".origins-thread.is-lit").length > 0`),
      "mouse: hovering a moment lights the threads of everyone there",
    );

    // Everyone else steps back, and comes forward again when the pointer
    // leaves. In the map only: the legend draws a bead of its own.
    const seen = (selector: string) =>
      `getComputedStyle(document.querySelector(${JSON.stringify(`#origins-braid ${selector}`)})).opacity`;
    const others = [
      ".origins-thread:not(.is-lit)",
      ".origins-bead:not(.is-lit)",
      ".origins-root:not(.is-lit)",
    ];
    const dimmed = await tab.waitFor(
      `[${others.map(seen).join(", ")}].every((o) => Number(o) < 0.5)`,
    );
    const lit = await tab.evaluate<string>(seen(".origins-thread.is-lit"));
    check(
      dimmed && lit === "1",
      "mouse: hovering a moment dims the thread, beads and face of everyone who was not there",
      { others: await tab.evaluate(`[${others.map(seen).join(", ")}]`), lit },
    );
    await tab.move(5, 5);
    check(
      await tab.waitFor(
        `[...${MAP}.querySelectorAll(".origins-thread, .origins-bead, .origins-root")].every((e) => getComputedStyle(e).opacity === "1")`,
      ),
      "mouse: nobody is left dimmed once the pointer leaves",
    );
  }
}

let broke: unknown;
try {
  await run();
} catch (error) {
  broke = error;
}

const failed = results.filter((r) => !r.ok);
for (const { ok, name, detail } of results) {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok && detail !== "") console.log(`       ${detail}`);
}
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
if (broke !== undefined) console.error("stopped early:", broke);

// After the report, so a browser that is slow to let go cannot cost it.
browser.close();
server.close();
process.exit(failed.length === 0 && broke === undefined ? 0 : 1);
