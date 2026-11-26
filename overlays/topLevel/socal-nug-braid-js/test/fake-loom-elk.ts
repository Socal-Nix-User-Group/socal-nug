import type { ElkGraph } from "../src/elk.ts";

/**
 * Stands in for ELK in loom tests: every node gets a box at a position made
 * from its partition, every label a spot beside its node, every edge one
 * section from where its source is to where its target is, with one bend. An
 * end on a port is the port's own spot on its node, an end on a root is the
 * root's centre. Nothing here is a layout; it is just shaped like one.
 */
export function fakeLoomLayout(graph: ElkGraph): Promise<ElkGraph> {
  const nodes = graph.children.map((n, i) => {
    const partition = Number(n.layoutOptions?.["elk.partitioning.partition"]);
    return {
      ...n,
      x: 100 + i * 20,
      y: partition * 50,
      labels: (n.labels ?? []).map((l) => ({ ...l, x: -l.width - 12, y: 1 })),
    };
  });
  const where = (id: string) => {
    for (const n of nodes) {
      if (n.id === id) return { x: n.x + n.width / 2, y: n.y + n.height / 2 };
      const port = n.ports?.find((p) => p.id === id);
      if (port !== undefined) return { x: n.x + port.x, y: n.y + port.y };
    }
    throw new Error(`no node or port ${id}`);
  };
  const edges = graph.edges.map((e) => ({
    ...e,
    sections: [{
      startPoint: where(e.sources[0]),
      bendPoints: [{ x: 7, y: 7 }],
      endPoint: where(e.targets[0]),
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
