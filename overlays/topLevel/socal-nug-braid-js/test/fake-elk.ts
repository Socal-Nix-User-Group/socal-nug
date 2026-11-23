import { parseFuzzyDate } from "../src/dates.ts";
import { buildBraid } from "../src/layout.ts";
import type { ElkGraph } from "../src/graph.ts";
import type { Moment, Person } from "../src/types.ts";

/**
 * Stands in for ELK in tests: every node gets a box at a position made from
 * its partition, every label a spot beside its node, every edge one section
 * from source centre to target centre with one bend. Nothing here is a
 * layout; it is just shaped like one, so what the engine does with a layout
 * can be tested without running one.
 */
export function fakeLayout(graph: ElkGraph): Promise<ElkGraph> {
  const nodes = graph.children.map((n, i) => {
    const partition = Number(n.layoutOptions?.["elk.partitioning.partition"]);
    return {
      ...n,
      x: 100 + i * 20,
      y: partition * 50,
      labels: (n.labels ?? []).map((l) => ({ ...l, x: -l.width - 12, y: 1 })),
    };
  });
  const centre = (id: string) => {
    const n = nodes.find((m) => m.id === id)!;
    return { x: n.x + n.width / 2, y: n.y + n.height / 2 };
  };
  const edges = graph.edges.map((e) => ({
    ...e,
    sections: [{
      startPoint: centre(e.sources[0]),
      bendPoints: [{ x: 7, y: 7 }],
      endPoint: centre(e.targets[0]),
    }],
  }));
  return Promise.resolve({
    ...graph,
    children: nodes,
    edges,
    width: 640,
    height: 480,
  });
}

export function person(slug: string, member = true, imageUrl = ""): Person {
  return {
    slug,
    name: slug.toUpperCase(),
    alias: `@${slug}`,
    description: "",
    quote: "",
    imageUrl,
    profileUrl: "",
    member,
  };
}

export function at(
  id: string,
  date: string,
  people: string[],
  trunk = false,
): Moment {
  return { id, date: parseFuzzyDate(date), title: id, people, trunk };
}

export const PEOPLE = new Map([
  ["a", person("a", true, "https://example.com/a.png")],
  ["b", person("b", false)],
]);

/** A root, the founding, a detour that recruits, and the meetup they join at. */
export const STORY: Moment[] = [
  at("a-root", "2021-01", ["a"]),
  at("founded", "2023-01", ["a"], true),
  at("camp", "2023-04", ["a", "b"]),
  at("nug", "2023-07", ["b"], true),
];

export const braid = buildBraid(STORY, PEOPLE);
