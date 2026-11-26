import type { ElkGraph } from "../src/elk.ts";

/**
 * The Eclipse Layout Kernel, as the smoke check imports it.
 *
 * The file this describes is not in the tree: it is the vendored
 * `static/js/vendor/elk.bundled.js`, copied in beside the check at build
 * time and left out of the bundle, so the check lays out through exactly
 * what the page loads. Declaring it here is what lets the smoke check be
 * typechecked along with everything else rather than written against
 * `unknown` and cast back.
 */
declare class ELK {
  constructor();
  layout(graph: ElkGraph): Promise<ElkGraph>;
}

export default ELK;
