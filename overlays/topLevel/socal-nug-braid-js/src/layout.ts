import type {
  Braid,
  Excursion,
  Moment,
  PlacedMoment,
  Person,
  Thread,
  ThreadSegment,
  TrunkSegment,
} from "./types.ts";

/** Chronological, ties broken by id so the same data always draws the same. */
function ordered(moments: readonly Moment[]): Moment[] {
  return [...moments].sort(
    (a, b) =>
      a.date.start - b.date.start || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** Position in the ordered list at which each person first appears. */
function firstSeen(seq: readonly Moment[]): Map<string, number> {
  const seen = new Map<string, number>();
  seq.forEach((moment, index) => {
    for (const slug of moment.people) {
      if (!seen.has(slug)) {
        seen.set(slug, index);
      }
    }
  });
  return seen;
}

/**
 * Lanes, allocated the way git draws a branch graph.
 *
 * A column is taken when a strand first needs one, released the moment it
 * merges away, and reused by whoever needs one next. That keeps the picture
 * compact however much history is added, and it means a column is a drawing
 * slot rather than a statement about the person in it.
 *
 * The one place this departs from git: a merge takes a column neither party
 * was sitting in. Git lets the target branch continue, which is fine for refs
 * but reads as prominence when the lines are people. Letting one thread hold
 * its column through every merge is how the earliest person ends up a dead
 * straight line with everyone bending into them.
 */
function allocateLanes(
  seq: readonly Moment[],
  seen: ReadonlyMap<string, number>,
  joinIndex: ReadonlyMap<string, number>,
) {
  const trunkAt = seq.findIndex((m) => m.trunk);
  const trunkIndices = seq
    .map((m, i) => (m.trunk ? i : -1))
    .filter((i) => i >= 0);

  const lastSeen = new Map<string, number>();
  seq.forEach((moment, index) => {
    for (const slug of moment.people) lastSeen.set(slug, index);
  });

  const laneOf = new Map<string, number>();
  const initial = new Map<string, number>();
  const held = new Map<number, Set<string>>();
  const releaseAt = new Map<number, number[]>();

  const take = (lane: number, slug: string) => {
    laneOf.set(slug, lane);
    if (!held.has(lane)) held.set(lane, new Set());
    held.get(lane)!.add(slug);
  };
  const drop = (slug: string) => {
    const lane = laneOf.get(slug);
    if (lane === undefined) return;
    const sharing = held.get(lane);
    sharing?.delete(slug);
    if (sharing !== undefined && sharing.size === 0) held.delete(lane);
  };
  const vacant = (lane: number) => lane !== 0 && !held.has(lane);

  /** Innermost free column on a side, skipping any the caller rules out. */
  const alloc = (side: 1 | -1, avoid: ReadonlySet<number>): number => {
    let step = 1;
    while (!vacant(side * step) || avoid.has(side * step)) step += 1;
    return side * step;
  };

  // Someone whose story starts before the spine goes on one side of it,
  // someone who arrives afterwards on the other.
  const sideFor = (slug: string): 1 | -1 =>
    trunkAt >= 0 && (seen.get(slug) ?? 0) >= trunkAt ? 1 : -1;

  /**
   * Starting columns, held for the whole picture.
   *
   * A face is drawn a rank ahead of its owner's first moment, in territory
   * the walk below never books, so handing a starting column on to the next
   * arrival parks their face on the previous occupant's line. Keeping these
   * costs columns; it buys a column that means one person all the way down.
   */
  const claimed = new Set<number>();
  const momentLane = new Map<string, number>();
  const excursionLane = new Map<string, number>();

  type Draft = {
    moment: Moment;
    index: number;
    leaves: string[];
    recruits: string[];
    fromIndex: number;
    toIndex: number | null;
  };
  const drafts: Draft[] = [];

  seq.forEach((moment, index) => {
    // an excursion gives its column back when its threads rejoin the spine
    for (const lane of releaseAt.get(index) ?? []) held.delete(lane);

    for (const slug of moment.people) {
      if (!laneOf.has(slug)) {
        const lane = alloc(sideFor(slug), claimed);
        take(lane, slug);
        initial.set(slug, lane);
        claimed.add(lane);
      }
    }

    if (moment.trunk) {
      momentLane.set(moment.id, 0);
      for (const slug of moment.people) {
        drop(slug);
        take(0, slug);
      }
      return;
    }

    const leaves = moment.people.filter(
      (slug) => (joinIndex.get(slug) ?? Number.POSITIVE_INFINITY) <= index,
    );

    if (trunkAt >= 0 && index >= trunkAt && leaves.length > 0) {
      const recruits = moment.people.filter((slug) => !leaves.includes(slug));
      const before = trunkIndices.filter((i) => i < index);
      const after = trunkIndices.filter((i) => i > index);
      const toIndex = after.length > 0 ? after[0] : null;

      // A starting column is only occupied while its owner is approaching the
      // spine: a face at the top, a line down to wherever they join. Once
      // they are on the spine nothing is drawn in it, so a detour may borrow
      // it. Skipping every starting column regardless pushed detours out past
      // the whole roster, and one that far out crosses everything on its way
      // there and back.
      const spanFrom = before[before.length - 1];
      const spanTo = toIndex ?? seq.length - 1;
      const approached = new Set(
        [...initial]
          .filter(([slug]) => {
            const from = (seen.get(slug) ?? 0) - 1;
            const to = joinIndex.get(slug) ?? lastSeen.get(slug) ?? from;
            return from <= spanTo && to >= spanFrom;
          })
          .map(([, lane]) => lane),
      );

      // held for the stretch the detour spans, so two overlapping excursions
      // cannot land on the same column
      const lane = alloc(-1, approached);
      held.set(lane, new Set([`excursion:${moment.id}`]));
      if (toIndex !== null) {
        releaseAt.set(toIndex, [...(releaseAt.get(toIndex) ?? []), lane]);
      }

      momentLane.set(moment.id, lane);
      excursionLane.set(moment.id, lane);
      drafts.push({
        moment,
        index,
        leaves,
        recruits,
        fromIndex: before[before.length - 1],
        toIndex,
      });
      return;
    }

    const carryOn = moment.people.filter(
      (slug) => (lastSeen.get(slug) ?? -1) > index,
    );

    if (carryOn.length >= 2) {
      const avoid = new Set([...carryOn.map((s) => laneOf.get(s)!), ...claimed]);
      for (const slug of carryOn) drop(slug);
      const lane = alloc(sideFor(carryOn[0]), avoid);
      for (const slug of carryOn) take(lane, slug);
      momentLane.set(moment.id, lane);
    } else if (carryOn.length === 1) {
      momentLane.set(moment.id, laneOf.get(carryOn[0])!);
    } else {
      momentLane.set(moment.id, laneOf.get(moment.people[0]) ?? 0);
    }

    // whoever stops here gives their column back
    for (const slug of moment.people) {
      if ((lastSeen.get(slug) ?? -1) === index) drop(slug);
    }
  });

  return { initial, momentLane, excursionLane, drafts };
}

/** The column each person's thread starts in. */
export function assignLanes(moments: readonly Moment[]): Map<string, number> {
  const seq = ordered(moments);
  return allocateLanes(seq, firstSeen(seq), joinsFrom(seq)).initial;
}

/** Joins come only from a trunk moment naming you. Nothing is inferred. */
function joinsFrom(seq: readonly Moment[]): Map<string, number> {
  const joinIndex = new Map<string, number>();
  seq.forEach((moment, index) => {
    if (!moment.trunk) return;
    for (const slug of moment.people) {
      if (!joinIndex.has(slug)) joinIndex.set(slug, index);
    }
  });
  return joinIndex;
}

export function buildBraid(
  moments: readonly Moment[],
  people: ReadonlyMap<string, Person>,
): Braid {
  const seq = ordered(moments);
  const seen = firstSeen(seq);
  const indexOf = new Map(seq.map((m, i) => [m.id, i]));
  const span = seq.length - 1;
  const tOf = (i: number) => (span <= 0 ? 0.5 : i / span);

  const joinIndex = joinsFrom(seq);
  const { initial, momentLane, excursionLane, drafts } = allocateLanes(
    seq,
    seen,
    joinIndex,
  );
  const placed: PlacedMoment[] = seq.map((moment, index) => ({
    moment,
    t: tOf(index),
    lane: momentLane.get(moment.id) ?? 0,
  }));
  const placedById = new Map(placed.map((p) => [p.moment.id, p]));

  const excursions: Excursion[] = drafts.map((draft) => ({
    moment: placedById.get(draft.moment.id)!,
    lane: excursionLane.get(draft.moment.id)!,
    from: placed[draft.fromIndex],
    to: draft.toIndex === null ? null : placed[draft.toIndex],
    leaves: draft.leaves,
    recruits: draft.recruits,
  }));

  const threads: Thread[] = [];
  for (const [slug, person] of people) {
    const mine = placed.filter((p) => p.moment.people.includes(slug));
    if (mine.length === 0) continue;

    const joined = joinIndex.get(slug);
    const approach =
      joined === undefined
        ? mine
        : mine.filter((p) => indexOf.get(p.moment.id)! <= joined);

    const segments: ThreadSegment[] = [{ points: approach, kind: "approach" }];
    for (const excursion of excursions) {
      if (excursion.leaves.includes(slug)) {
        segments.push({ points: [excursion.moment], kind: "excursion" });
      }
    }

    threads.push({
      person,
      lane: initial.get(slug) ?? 0,
      segments,
      joinsTrunkAt: joined === undefined ? null : seq[joined].id,
    });
  }

  const trunkPlaced = placed.filter((p) => p.moment.trunk);
  const trunk: TrunkSegment[] = [];
  for (let i = 0; i < trunkPlaced.length - 1; i += 1) {
    const from = trunkPlaced[i];
    const fromIndex = indexOf.get(from.moment.id)!;
    let count = 0;
    for (const joined of joinIndex.values()) {
      if (joined <= fromIndex) count += 1;
    }
    const away = excursions
      .filter((e) => e.from.moment.id === from.moment.id)
      .reduce((total, e) => total + e.leaves.length, 0);
    trunk.push({ from, to: trunkPlaced[i + 1], joined: count, away });
  }

  return { moments: placed, threads, trunk, excursions };
}
