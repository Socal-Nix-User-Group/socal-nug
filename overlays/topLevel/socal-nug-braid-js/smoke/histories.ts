/**
 * Made-up histories of a group, in the shape the page's data comes in, to
 * lay the loom out on something larger than today's record. The same seed
 * always gives the same history.
 */

/** A small seeded generator, so a history is the same on every machine. */
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A month counted from year 0, as YYYY-MM. */
function month(count: number): string {
  const year = Math.floor(count / 12);
  return `${year}-${String((count % 12) + 1).padStart(2, "0")}`;
}

const FOUNDING = 2023 * 12 + 3;
const FIRST_MEETUP = 2023 * 12 + 5;

interface RawMoment {
  id: string;
  date: string;
  title: string;
  people: string[];
  trunk: boolean;
}

export function history(seed: number, years: number): unknown {
  const next = generator(seed);
  const pick = (from: number, to: number) =>
    from + Math.floor(next() * (to - from + 1));

  const count = 9 + 2 * years;
  const meetups = 20 + 6 * years;
  const slugs = Array.from({ length: count }, (_, i) => `p${i}`);
  const people = slugs.map((slug, i) => ({
    slug,
    name: `Person ${i}`,
    alias: `@${slug}`,
    member: true,
  }));

  const meetupMonth = (n: number) => FIRST_MEETUP + 2 * (n - 1);
  const joinedAt = slugs.map((_, i) =>
    i < 3 ? 0 : 1 + Math.floor(((i - 3) * meetups) / (count - 3))
  );
  const joinMonth = (i: number) =>
    joinedAt[i] === 0 ? FOUNDING : meetupMonth(joinedAt[i]);
  const membersAt = (n: number) => slugs.filter((_, i) => joinedAt[i] <= n);

  const moments: RawMoment[] = [
    {
      id: "founded",
      date: month(FOUNDING),
      title: "Founding",
      people: ["p0", "p1", "p2"],
      trunk: true,
    },
  ];
  for (let n = 1; n <= meetups; n += 1) {
    moments.push({
      id: `m${n}`,
      date: month(meetupMonth(n)),
      title: `Meetup ${n}`,
      people: slugs.filter((_, i) => joinedAt[i] === n),
      trunk: true,
    });
  }

  slugs.forEach((slug, i) => {
    moments.push({
      id: `contact-${slug}`,
      date: month(joinMonth(i) - 12 * pick(1, 4)),
      title: `First contact ${slug}`,
      people: [slug],
      trunk: false,
    });
    const crosses = next() < 0.5;
    const other = pick(0, Math.max(0, i - 1));
    if (crosses && i > 0) {
      moments.push({
        id: `cross-${slug}`,
        date: month(joinMonth(i) - pick(1, 11)),
        title: `Paths cross ${slug}`,
        people: [slug, slugs[other]],
        trunk: false,
      });
    }
  });

  const part = (n: number) => {
    const pool = membersAt(n);
    const size = Math.min(pick(2, 5), pool.length - 1);
    const chosen: string[] = [];
    while (chosen.length < size) {
      const slug = pool[pick(0, pool.length - 1)];
      if (!chosen.includes(slug)) chosen.push(slug);
    }
    return chosen;
  };

  const kinds = ["part", "part", "whole"] as const;
  let detour = 0;
  for (let year = 0; year < years; year += 1) {
    kinds.forEach((kind, d) => {
      const n = 1 + year * 6 + 2 * d;
      detour += 1;
      moments.push({
        id: `detour-${detour}`,
        date: month(meetupMonth(n) + 1),
        title: `Detour ${detour}`,
        people: kind === "whole" ? membersAt(n) : part(n),
        trunk: false,
      });
    });
  }

  const stretch = 2 + 2 * Math.floor(meetups / 4);
  const everyone = membersAt(stretch);
  const cut = pick(2, everyone.length - 2);
  [everyone.slice(0, cut), everyone.slice(cut)].forEach((group, i) => {
    moments.push({
      id: `stretch-${i + 1}`,
      date: month(meetupMonth(stretch) + 1),
      title: `Stretch ${i + 1}`,
      people: group,
      trunk: false,
    });
  });

  return { people, moments };
}
