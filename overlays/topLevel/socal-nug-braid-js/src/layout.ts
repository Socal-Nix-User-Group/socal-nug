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
 * Lanes either side of the spine. People whose story starts before the trunk
 * sit on the negative side with the longest history furthest out, so
 * backfilling someone's earlier past moves them outward. Later joiners take
 * the positive side in the order they arrive.
 */
export function assignLanes(moments: readonly Moment[]): Map<string, number> {
  const seq = ordered(moments);
  const seen = firstSeen(seq);
  const trunkAt = seq.findIndex((m) => m.trunk);

  const byArrival = [...seen.entries()].sort(
    (a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1),
  );

  const early: string[] = [];
  const late: string[] = [];
  for (const [slug, index] of byArrival) {
    if (trunkAt >= 0 && index >= trunkAt) {
      late.push(slug);
    } else {
      early.push(slug);
    }
  }

  const lanes = new Map<string, number>();
  early.forEach((slug, i) => lanes.set(slug, -(early.length - i)));
  late.forEach((slug, i) => lanes.set(slug, i + 1));
  return lanes;
}

export function buildBraid(
  moments: readonly Moment[],
  people: ReadonlyMap<string, Person>,
): Braid {
  const seq = ordered(moments);
  const lanes = assignLanes(seq);
  const trunkAt = seq.findIndex((m) => m.trunk);

  const indexOf = new Map(seq.map((m, i) => [m.id, i]));
  const span = seq.length - 1;
  const tOf = (i: number) => (span <= 0 ? 0.5 : i / span);

  // Pass one: joining the trunk by being named in a trunk moment.
  const joinIndex = new Map<string, number>();
  seq.forEach((moment, index) => {
    if (!moment.trunk) return;
    for (const slug of moment.people) {
      if (!joinIndex.has(slug)) {
        joinIndex.set(slug, index);
      }
    }
  });

  const trunkIndices = seq
    .map((m, i) => (m.trunk ? i : -1))
    .filter((i) => i >= 0);

  // An excursion is a non-trunk moment after the spine starts whose people are
  // already in it. Nothing in the data says so; it follows from those two facts.
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
    if (moment.trunk || trunkAt < 0 || index < trunkAt) return;
    const leaves = moment.people.filter((slug) => {
      const joined = joinIndex.get(slug);
      return joined !== undefined && joined <= index;
    });
    if (leaves.length === 0) return;
    const recruits = moment.people.filter((slug) => !leaves.includes(slug));
    const before = trunkIndices.filter((i) => i < index);
    const after = trunkIndices.filter((i) => i > index);
    drafts.push({
      moment,
      index,
      leaves,
      recruits,
      fromIndex: before[before.length - 1],
      toIndex: after.length > 0 ? after[0] : null,
    });
  });

  // Pass two: a recruit joins the trunk where the excursion rejoins it, not at
  // the excursion itself, so their card reads truthfully.
  for (const draft of drafts) {
    if (draft.toIndex === null) continue;
    for (const slug of draft.recruits) {
      if (!joinIndex.has(slug)) {
        joinIndex.set(slug, draft.toIndex);
      }
    }
  }

  // Excursion lanes come from a pool on the pre-convergence side. By the time
  // an excursion can happen, everyone there has merged into the spine and that
  // space is free, while the joiner side is still filling up: allocating there
  // made the departure curve cross incoming threads and their root avatars.
  // A lane is taken for the stretch the detour spans and released after it, so
  // a later excursion reuses it and simultaneous ones never collide.
  const minEarly = Math.min(0, ...[...lanes.values()].filter((l) => l < 0));
  const freeFrom = new Map<number, number>();
  const excursionLane = new Map<string, number>();
  for (const draft of drafts) {
    let lane = minEarly - 1;
    while ((freeFrom.get(lane) ?? -1) > draft.fromIndex) {
      lane -= 1;
    }
    freeFrom.set(lane, draft.toIndex ?? seq.length);
    excursionLane.set(draft.moment.id, lane);
  }

  // Where each person currently is. Lanes are a trajectory, not a fixed row:
  // people who carry on together after a shared moment travel on a lane
  // between them from that point.
  const at = new Map(lanes);
  const lastSeen = new Map<string, number>();
  seq.forEach((moment, index) => {
    for (const slug of moment.people) lastSeen.set(slug, index);
  });

  const laneOfMoment = (moment: Moment, index: number): number => {
    if (moment.trunk) {
      for (const slug of moment.people) at.set(slug, 0);
      return 0;
    }

    const excursion = excursionLane.get(moment.id);
    if (excursion !== undefined) return excursion;

    const present = moment.people.filter((slug) => at.has(slug));
    if (present.length === 0) return 0;

    const mean = (slugs: readonly string[]) =>
      slugs.reduce((total, slug) => total + at.get(slug)!, 0) / slugs.length;

    // Only people who appear again are actually travelling on from here. A
    // one-off guest bends in and stops, and must not drag the lane of
    // somebody whose story continues.
    const carryOn = present.filter((slug) => lastSeen.get(slug)! > index);

    if (carryOn.length >= 2) {
      // A genuine merge. Nobody keeps their lane, so no thread reads as the
      // axis the others joined: they all move to meet in between.
      const merged = mean(carryOn);
      for (const slug of carryOn) at.set(slug, merged);
      return merged;
    }

    return carryOn.length === 1 ? at.get(carryOn[0])! : mean(present);
  };

  const placed: PlacedMoment[] = seq.map((moment, index) => ({
    moment,
    t: tOf(index),
    lane: laneOfMoment(moment, index),
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
      lane: lanes.get(slug) ?? 0,
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
