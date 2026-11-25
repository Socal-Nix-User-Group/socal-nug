import { LABEL_MAX } from "../src/elk.ts";
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

/** Where the page, the map and the roster are scrolled to, unrounded, as one string. */
const scrollState = `(scrollY + "," + ${MAP}.scrollTop + "," + ${ROSTER}.scrollTop)`;

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
 * Whatever a switch has left set on the box, the layout, the roster list or
 * its cards, and any card that is not back in its place in the roster.
 */
const leftBehind = (): Promise<string[]> =>
  tab.evaluate(`(() => {
    const out = [];
    const layout = document.getElementById("origins-layout");
    const list = ${ROSTER}.querySelector(".origins-roster");
    for (const [name, e] of [["box", ${MAP}], ["layout", layout], ["list", list]]) {
      if (e.hasAttribute("style")) out.push(name + " has a style");
    }
    const rail = ${ROSTER}.getBoundingClientRect();
    [...${ROSTER}.querySelectorAll(".origins-roster-item")].forEach((item, i) => {
      const card = item.querySelector(".origins-card");
      const b = item.getBoundingClientRect();
      if (item.hasAttribute("style") || (card !== null && card.hasAttribute("style"))) {
        out.push("card " + i + " has a style");
      }
      if (getComputedStyle(item).position !== "static" || item.parentElement !== list) {
        out.push("card " + i + " is out of the list");
      }
      if (b.left < rail.left - 1 || b.right > rail.right + 1) {
        out.push("card " + i + " is outside the roster");
      }
    });
    return out;
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

    await tab.evaluate(`${ROSTER}.scrollIntoView({ block: "center" })`);
    const at = await tab.evaluate<Point>(`(() => {
      const b = ${ROSTER}.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    })()`);
    const { ok, detail } = more
      ? await untilThePageMoves(() => tab.wheel(at.x, at.y, 300))
      : { ok: true, detail: { nothingToScroll: true } };
    const moved = await tab.evaluate<number>(`${ROSTER}.scrollTop`);
    check(
      ok && (!more || moved > 0),
      "River: the wheel over the roster scrolls the roster, and carries on down the page at its end",
      { ...detail, roster: moved },
    );
  }

  const whole = `getComputedStyle(${ROSTER}).overflowY === "visible" && ${ROSTER}.scrollHeight <= ${ROSTER}.clientHeight`;
  const rosterBox = `({ overflowY: getComputedStyle(${ROSTER}).overflowY, content: ${ROSTER}.scrollHeight, box: ${ROSTER}.clientHeight })`;
  await load("subway");
  check(
    await tab.evaluate<boolean>(whole),
    "Subway: the roster under the map is the whole list, with nothing to scroll inside it",
    await tab.evaluate(rosterBox),
  );
  await load("river", 900, 900);
  check(
    await tab.evaluate<boolean>(whole),
    "a narrow window: the roster under the map is the whole list in River too",
    await tab.evaluate(rosterBox),
  );

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
    await watchForMorph();
    await pressMode("subway");
    const landed = await landedIn("subway");
    const moved = await morphed();
    const after = await shape();
    const left = await leftBehind();
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
  await tab.send("Emulation.setEmulatedMedia", { features: [] });
  if (await tab.evaluate<boolean>(`matchMedia("(prefers-reduced-motion: reduce)").matches`)) {
    throw new Error("reduced motion is still asked for after the check that asked for it");
  }

  // --- cards and focus ----------------------------------------------------------

  await load("river");
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

  await load("river");
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
    const cards = `document.querySelectorAll("#origins-roster .origins-card").length`;
    const everyone = await tab.evaluate<number>(cards);
    await tab.send("Network.setCacheDisabled", { cacheDisabled: true });
    await tab.send("Network.setBlockedURLs", { urls: ["*elk.bundled.js*"] });
    await tab.goto(page);
    const said = await tab.waitFor(
      `${MAP}.innerText.trim().length > 0 && document.querySelector("#origins-braid svg") === null`,
    );
    const roster = await tab.evaluate<number>(cards);
    check(
      everyone > 0 && roster === everyone,
      "without the layout engine, the roster is still there",
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

    // Starting on a moment and ending on whatever is there: the map moves
    // and no card opens, for the one pressed or the one let go over.
    const dot = await centreOf(SIDE_DOT);
    const dotStart = await mapAt();
    await tab.pull(dot.x, dot.y, dot.x, dot.y - 150);
    const dragged = await tab.waitFor(`${MAP}.scrollTop >= ${dotStart.top + 140}`);
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
    await tab.pull(hold.x, hold.y, hold.x, hold.y - 60);
    const carried = await tab.waitFor(`${MAP}.scrollTop >= ${cardStart.top + 50}`);
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
    const dot = await centreOf(SIDE_DOT);
    await tab.tap(dot.x, dot.y);
    const opened = await tab.waitFor(popupOpen);
    await sleep(300);
    const lit = await tab.evaluate<number>(
      `document.querySelectorAll(".is-lit").length`,
    );
    check(
      opened && lit === 0,
      "touch: a tap opens the card and leaves nothing stuck highlighted",
      { opened, lit },
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
