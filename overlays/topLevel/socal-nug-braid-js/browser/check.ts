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

/** Where the page and the map are scrolled to, unrounded, as one string. */
const scrollState = `(scrollY + "," + ${MAP}.scrollTop)`;

/**
 * Repeat a gesture inside the map, as a visitor would, until the page itself
 * has moved. After each gesture, wait for the map or the page to move and
 * then to come to rest. A gesture that moves neither is a stall.
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
