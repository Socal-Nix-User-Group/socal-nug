import type { Person } from "./types.ts";

/**
 * The slice of the DOM this engine uses, and the two pieces of drawing that
 * every renderer shares: a face, and a path that eases between points.
 *
 * The real `document` satisfies the DOM slice structurally, and so can a
 * recording stub, which is how drawing is tested without a DOM library.
 */
export interface ElementLike {
  setAttribute(name: string, value: string): void;
  appendChild(child: ElementLike): ElementLike;
  textContent: string;
}

export interface DocumentLike {
  createElementNS(ns: string, qualifiedName: string): ElementLike;
}

export { hueFor, PALETTE_SIZE } from "./palette.ts";

const SVG = "http://www.w3.org/2000/svg";
const AVATAR = 18;
/** How far a hop's control points sit along the time axis. 0 is a corner. */
const EASE = 0.5;

const round = (n: number) => Math.round(n * 100) / 100;

function make(
  doc: DocumentLike,
  tag: string,
  attrs: Record<string, string | number>,
): ElementLike {
  const element = doc.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) {
    element.setAttribute(name, String(value));
  }
  return element;
}

/**
 * A ringed circular avatar. An empty `imageUrl` falls back to an initial
 * rather than an empty `<image>`, which browsers would resolve against the
 * page URL and fetch.
 */
export function avatarFor(person: Person, doc: DocumentLike): ElementLike {
  const kind = person.member ? "is-member" : "is-guest";
  const group = make(doc, "g", { class: `origins-avatar ${kind}` });

  if (person.imageUrl !== "") {
    group.appendChild(
      make(doc, "image", {
        href: person.imageUrl,
        x: -AVATAR,
        y: -AVATAR,
        width: AVATAR * 2,
        height: AVATAR * 2,
        "clip-path": "circle()",
        class: "origins-avatar-image",
        // the group around it carries the person's name; without this a
        // screen reader reads the face a second time as an unnamed image
        "aria-hidden": "true",
      }),
    );
  } else {
    group.appendChild(
      make(doc, "circle", { r: AVATAR, class: "origins-avatar-blank" }),
    );
    const initial = make(doc, "text", {
      class: "origins-avatar-initial",
      "text-anchor": "middle",
      dy: 5,
    });
    initial.textContent = person.name.slice(0, 1).toUpperCase();
    group.appendChild(initial);
  }

  group.appendChild(
    make(doc, "circle", { r: AVATAR, class: "origins-avatar-ring" }),
  );
  return group;
}

/**
 * A path that eases into and out of every point instead of turning corners.
 *
 * Each hop is a cubic whose control points sit on the time axis, so a hop that
 * stays in one column is still a straight line while one that changes column
 * is an S-curve. That is what makes a thread look like it flows into the
 * spine rather than meeting it at an angle.
 */
export function flow(
  points: readonly (readonly [number, number])[],
  axis: "x" | "y",
): string {
  if (points.length === 0) return "";
  let d = `M${round(points[0][0])},${round(points[0][1])}`;
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (axis === "y") {
      const ease = (y1 - y0) * EASE;
      d += ` C${round(x0)},${round(y0 + ease)}` +
        ` ${round(x1)},${round(y1 - ease)}` +
        ` ${round(x1)},${round(y1)}`;
    } else {
      const ease = (x1 - x0) * EASE;
      d += ` C${round(x0 + ease)},${round(y0)}` +
        ` ${round(x1 - ease)},${round(y1)}` +
        ` ${round(x1)},${round(y1)}`;
    }
  }
  return d;
}
