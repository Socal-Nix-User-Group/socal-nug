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
 * Half the width of a moment's avatar, the event's own mark. A face's size.
 * The layout leaves room for it with the label: beside the text in River,
 * above it in Subway.
 */
export const MOMENT_AVATAR = 18;
/** The room between a moment's avatar and its label's text. */
export const MOMENT_AVATAR_GAP = 4;
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

const ROOT = "root:";
/** The node a person's face sits on, a layer ahead of their first moment. */
export const rootId = (slug: string): string => `${ROOT}${slug}`;
/** The person a root node belongs to, or null for a moment's node. */
export const rootSlug = (id: string): string | null =>
  id.startsWith(ROOT) ? id.slice(ROOT.length) : null;
