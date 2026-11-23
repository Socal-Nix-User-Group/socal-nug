import type {
  Braid,
  Excursion,
  Moment,
  Person,
  PlacedMoment,
  Thread,
  ThreadSegment,
  TrunkSegment,
} from "./types.ts";

/**
 * What the picture is made of, before anything is placed.
 *
 * This reads the moments and decides the shape of the story: the order
 * things happened in, who joined the group where, which moments are detours
 * from it and who left for them, and how thick the spine is along its length.
 * Where any of it goes on the page is the layout engine's decision, made in
 * graph.ts and place.ts. Keeping the two apart is what let the engine change
 * under the page without the story changing with it.
 */

/** Chronological, ties broken by id so the same data always draws the same. */
function ordered(moments: readonly Moment[]): Moment[] {
  return [...moments].sort(
    (a, b) =>
      a.date.start - b.date.start || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
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

interface Draft {
  readonly moment: Moment;
  readonly leaves: readonly string[];
  readonly recruits: readonly string[];
  readonly fromIndex: number;
  readonly toIndex: number | null;
}

/**
 * Detours: a non-trunk moment after the spine starts that names somebody
 * already on it. Those people leave the trunk at the meetup before it and
 * rejoin at the one after. Anyone else named there was there without being
 * in the group yet, which is recorded but grants nothing.
 */
function excursionsIn(
  seq: readonly Moment[],
  joinIndex: ReadonlyMap<string, number>,
): Draft[] {
  const trunkAt = seq.findIndex((m) => m.trunk);
  const trunkIndices = seq
    .map((m, i) => (m.trunk ? i : -1))
    .filter((i) => i >= 0);

  const drafts: Draft[] = [];
  seq.forEach((moment, index) => {
    if (moment.trunk || trunkAt < 0 || index < trunkAt) return;
    const leaves = moment.people.filter(
      (slug) => (joinIndex.get(slug) ?? Number.POSITIVE_INFINITY) <= index,
    );
    if (leaves.length === 0) return;
    const before = trunkIndices.filter((i) => i < index);
    const after = trunkIndices.filter((i) => i > index);
    drafts.push({
      moment,
      leaves,
      recruits: moment.people.filter((slug) => !leaves.includes(slug)),
      fromIndex: before[before.length - 1],
      toIndex: after.length > 0 ? after[0] : null,
    });
  });
  return drafts;
}

export function buildBraid(
  moments: readonly Moment[],
  people: ReadonlyMap<string, Person>,
): Braid {
  const seq = ordered(moments);
  const indexOf = new Map(seq.map((m, i) => [m.id, i]));
  const joinIndex = joinsFrom(seq);

  const placed: PlacedMoment[] = seq.map((moment) => ({ moment }));
  const placedById = new Map(placed.map((p) => [p.moment.id, p]));

  const excursions: Excursion[] = excursionsIn(seq, joinIndex).map(
    (draft) => ({
      moment: placedById.get(draft.moment.id)!,
      from: placed[draft.fromIndex],
      to: draft.toIndex === null ? null : placed[draft.toIndex],
      leaves: draft.leaves,
      recruits: draft.recruits,
    }),
  );

  const threads: Thread[] = [];
  for (const [slug, person] of people) {
    const mine = placed.filter((p) => p.moment.people.includes(slug));
    if (mine.length === 0) continue;

    // Everything up to and including the join is the approach. After that
    // the person rides the trunk, and only their detours are drawn.
    const joined = joinIndex.get(slug);
    const approach = joined === undefined
      ? mine
      : mine.filter((p) => indexOf.get(p.moment.id)! <= joined);

    const segments: ThreadSegment[] = [{ points: approach, kind: "approach" }];
    // One trip per stretch between two meetups, calling at every detour in
    // it this person was at, in date order. A person is in one place at a
    // time: a loop out and back for each detour drew somebody at three of
    // them as three lines leaving the same meetup.
    const trips = new Map<string, PlacedMoment[]>();
    for (const excursion of excursions) {
      if (!excursion.leaves.includes(slug)) continue;
      const stretch = excursion.from.moment.id;
      trips.set(stretch, [...(trips.get(stretch) ?? []), excursion.moment]);
    }
    for (const points of trips.values()) {
      segments.push({ points, kind: "excursion" });
    }

    threads.push({
      person,
      segments,
      joinsTrunkAt: joined === undefined ? null : seq[joined].id,
    });
  }

  // The spine thickens as people join and thins while they are away.
  const trunkPlaced = placed.filter((p) => p.moment.trunk);
  const trunk: TrunkSegment[] = [];
  for (let i = 0; i < trunkPlaced.length - 1; i += 1) {
    const from = trunkPlaced[i];
    const fromIndex = indexOf.get(from.moment.id)!;
    let count = 0;
    for (const joined of joinIndex.values()) {
      if (joined <= fromIndex) count += 1;
    }
    // Distinct people, not leaver-slots. Several detours can fall between one
    // pair of meetups with the same people at more than one of them, and
    // adding up their leavers made more people away than had ever joined.
    const away = new Set(
      excursions
        .filter((e) => e.from.moment.id === from.moment.id)
        .flatMap((e) => e.leaves),
    ).size;
    trunk.push({ from, to: trunkPlaced[i + 1], joined: count, away });
  }

  return { moments: placed, threads, trunk, excursions };
}
