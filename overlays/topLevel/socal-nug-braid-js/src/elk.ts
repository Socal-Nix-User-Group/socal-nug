/**
 * The shapes the Eclipse Layout Kernel takes and gives back, and the pieces of
 * the graph that are not about the loom's shape: the room a label claims and
 * the root node a face sits on.
 */

export type Mode = "river" | "subway";

export interface ElkPoint {
  readonly x: number;
  readonly y: number;
}

export interface ElkLabel {
  readonly text: string;
  readonly width: number;
  readonly height: number;
  readonly x?: number;
  readonly y?: number;
}

export interface ElkPort {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
  readonly layoutOptions: Readonly<Record<string, string>>;
}

export interface ElkNode {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly layoutOptions?: Readonly<Record<string, string>>;
  readonly labels?: readonly ElkLabel[];
  readonly ports?: readonly ElkPort[];
  readonly x?: number;
  readonly y?: number;
}

export interface ElkSection {
  readonly startPoint: ElkPoint;
  readonly bendPoints?: readonly ElkPoint[];
  readonly endPoint: ElkPoint;
}

export interface ElkEdge {
  readonly id: string;
  readonly sources: readonly string[];
  readonly targets: readonly string[];
  readonly layoutOptions?: Readonly<Record<string, string>>;
  readonly sections?: readonly ElkSection[];
}

export interface ElkGraph {
  readonly id: string;
  readonly layoutOptions: Readonly<Record<string, string>>;
  readonly children: readonly ElkNode[];
  readonly edges: readonly ElkEdge[];
  readonly width?: number;
  readonly height?: number;
}

export const AVATAR = 18;
/** What a label may claim beside its node; longer titles are cut to it. */
export const LABEL_MAX = 150;
export const LABEL_HEIGHT = 14;
/**
 * Half the width of a moment's avatar, the event's own mark: 24px across, by
 * Daniel's choice, where a face is 36px. The layout leaves room for it with
 * the label: beside the text in River, above it in Subway.
 */
export const MOMENT_AVATAR = 12;
/** The room between a moment's avatar and its label's text. */
export const MOMENT_AVATAR_GAP = 6;
/** Pixels per character at the label's 11px, near enough to reserve room. */
const CHAR = 6.4;

/**
 * A title as its label shows it: whole when it fits the room a label may
 * claim, cut and ended with an ellipsis when it does not. The card and the
 * screen reader's name for the oval carry the whole title either way.
 */
export function shown(title: string): string {
  const fits = Math.floor(LABEL_MAX / CHAR);
  return title.length <= fits
    ? title
    : `${title.slice(0, fits - 1).trimEnd()}…`;
}

/** The room ELK is told to leave for a label's text. */
export function labelWidth(text: string): number {
  return Math.round(text.length * CHAR * 10) / 10;
}

/**
 * How wide each character is drawn in the label's font, Barlow at 11px, as
 * headless Chromium measured them on 2026-11-24.
 */
const GLYPH: Readonly<Record<string, number>> = {
  " ": 2.2, "!": 3.52, '"': 2.34, "#": 7.25, "$": 6.14, "%": 9.31, "&": 7.23,
  "'": 0.91, "(": 2.88, ")": 2.88, "*": 4.36, "+": 5.5, ",": 2.67, "-": 4.25,
  ".": 2.83, "/": 4.23, "0": 6.22, "1": 3.84, "2": 5.89, "3": 5.66, "4": 6.06,
  "5": 5.66, "6": 5.66, "7": 5.2, "8": 5.73, "9": 5.73, ":": 3.73, ";": 3.42,
  "<": 5.5, "=": 5.5, ">": 5.5, "?": 5.06, "@": 9.09, A: 6.67, B: 6.89,
  C: 6.67, D: 6.8, E: 6.66, F: 6.11, G: 6.73, H: 7.19, I: 2.84, J: 6.34,
  K: 6.72, L: 6.25, M: 7.86, N: 7.44, O: 6.84, P: 6.52, Q: 6.33, R: 6.73,
  S: 6.42, T: 5.67, U: 7.13, V: 6.38, W: 9.55, X: 6.47, Y: 5.73, Z: 6.03,
  "[": 4.17, "\\": 4.41, "]": 4.17, "^": 4.95, _: 5.33, "`": 2.14, a: 5.63,
  b: 5.98, c: 5.64, d: 5.92, e: 5.78, f: 3.92, g: 5.88, h: 5.92, i: 2.81,
  j: 2.7, k: 5.5, l: 2.53, m: 9.09, n: 5.92, o: 5.92, p: 6.06, q: 6.06, r: 4,
  s: 5.28, t: 4, u: 5.89, v: 5.13, w: 7.83, x: 5.25, y: 4.97, z: 4.89,
  "{": 3.33, "|": 1.83, "}": 3.33, "~": 5.52, "…": 8.73,
};

/**
 * How wide a label's text is drawn. The room kept for a label is a flat width
 * a character, which is generous for most titles and leaves a different
 * amount to spare for each. Something set against the text, a moment's
 * avatar, is placed by this instead. A character the table does not have
 * counts for the flat width.
 */
export function textWidth(text: string): number {
  let width = 0;
  for (const ch of text) width += GLYPH[ch] ?? CHAR;
  return Math.round(width * 10) / 10;
}

const ROOT = "root:";
/** The node a person's face sits on, a layer ahead of their first moment. */
export const rootId = (slug: string): string => `${ROOT}${slug}`;
/** The person a root node belongs to, or null for a moment's node. */
export const rootSlug = (id: string): string | null =>
  id.startsWith(ROOT) ? id.slice(ROOT.length) : null;
