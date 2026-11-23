import type { Moment, Person } from "./types.ts";

/**
 * The story as threads and gatherings: every person is one thread from their
 * first moment on, and every moment is a gathering of the threads through it.
 * Nothing here is positional beyond a person's slot across a moment.
 */

/** One person at one moment. */
export interface Passage {
  readonly slug: string;
  /** Their position across the moment, counted from 0. */
  readonly slot: number;
  /** The record says they were there. */
  readonly vouched: boolean;
  /** This is the meetup they joined at. */
  readonly joined: boolean;
}

export interface Gathering {
  readonly moment: Moment;
  /** A meetup, or a moment everyone in the group at its date is through. */
  readonly onRibbon: boolean;
  /** How many slots its oval has, gaps for absent members included. Never less than 1. */
  readonly slots: number;
  /** How many people are in the group at its date. */
  readonly inGroup: number;
  /** Who is through it, in slot order. */
  readonly through: readonly Passage[];
}

export interface Thread {
  readonly person: Person;
  /** The gatherings they are through, in date order. */
  readonly path: readonly Gathering[];
  readonly joinsTrunkAt: string | null;
}

export interface Story {
  readonly moments: readonly Gathering[];
  /** In the order of the `people` map, which is the palette's order. */
  readonly threads: readonly Thread[];
  /** Slot order: every slug with a thread. */
  readonly order: readonly string[];
}

/** Chronological, ties broken by id so the same data always draws the same. */
function ordered(moments: readonly Moment[]): Moment[] {
  return [...moments].sort(
    (a, b) =>
      a.date.start - b.date.start || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export function buildStory(
  moments: readonly Moment[],
  people: ReadonlyMap<string, Person>,
): Story {
  const seq = ordered(moments);

  const joinIndex = new Map<string, number>();
  seq.forEach((moment, index) => {
    if (!moment.trunk) return;
    for (const slug of moment.people) {
      if (people.has(slug) && !joinIndex.has(slug)) joinIndex.set(slug, index);
    }
  });
  const members = (index: number) =>
    [...joinIndex].filter(([, joined]) => joined <= index).map(([slug]) => slug);

  const through = seq.map((moment, index) => {
    if (!moment.trunk) return moment.people.filter((slug) => people.has(slug));
    const away = moment.away ?? [];
    return members(index).filter((slug) => !away.includes(slug));
  });

  const firstMoment = new Map<string, number>();
  through.forEach((slugs, index) => {
    for (const slug of slugs) {
      if (!firstMoment.has(slug)) firstMoment.set(slug, index);
    }
  });

  const order = [...firstMoment.keys()].sort(
    (a, b) =>
      (joinIndex.get(a) ?? Infinity) - (joinIndex.get(b) ?? Infinity) ||
      firstMoment.get(a)! - firstMoment.get(b)! ||
      (a < b ? -1 : a > b ? 1 : 0),
  );
  const rank = (slug: string) => order.indexOf(slug);

  const gatherings = seq.map((moment, index): Gathering => {
    const group = members(index);
    const inGroup = group.length;
    const here = [...through[index]].sort((a, b) => rank(a) - rank(b));
    const onRibbon =
      moment.trunk || (inGroup > 0 && group.every((s) => here.includes(s)));
    const there = moment.there ?? [];
    const visitors = here.filter((slug) => !group.includes(slug));
    const slotOf = (slug: string) =>
      onRibbon
        ? group.includes(slug)
          ? rank(slug)
          : inGroup + visitors.indexOf(slug)
        : here.indexOf(slug);
    return {
      moment,
      onRibbon,
      slots: Math.max(1, onRibbon ? inGroup + visitors.length : here.length),
      inGroup,
      through: here.map((slug) => ({
        slug,
        slot: slotOf(slug),
        vouched: !moment.trunk || joinIndex.get(slug) === index || there.includes(slug),
        joined: moment.trunk && joinIndex.get(slug) === index,
      })),
    };
  });

  const threads = [...people.values()].flatMap((person): Thread[] => {
    const path = gatherings.filter((_, index) => through[index].includes(person.slug));
    if (path.length === 0) return [];
    const joined = joinIndex.get(person.slug);
    return [
      {
        person,
        path,
        joinsTrunkAt: joined === undefined ? null : seq[joined].id,
      },
    ];
  });

  return { moments: gatherings, threads, order };
}
