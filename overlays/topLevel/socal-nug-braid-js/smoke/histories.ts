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
  /** On a gathering beside the meetups, as a conference carries its own mark. */
  avatar?: string;
  /** On a meetup, as the page carries it: who the record says was there. */
  there?: string[];
  /** On any moment, as the page carries it: who the record says was away. */
  away?: string[];
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
      there: [],
      away: [],
    });
  }

  const contactMonth: number[] = [];
  slugs.forEach((slug, i) => {
    contactMonth[i] = joinMonth(i) - 12 * pick(1, 4);
    moments.push({
      id: `contact-${slug}`,
      date: month(contactMonth[i]),
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
        avatar: "/images/moments/made-up.png",
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
      avatar: "/images/moments/made-up.png",
    });
  });

  // Attendance, drawn after everything above so that is as it was for a seed.
  // Only someone who joined at an earlier meetup is recorded at one: nobody
  // is there or away before the meetup they joined at, or away from it.
  const meetup = (n: number) => moments.find((m) => m.id === `m${n}`)!;
  const before = (n: number) => slugs.filter((_, i) => joinedAt[i] < n);
  const taken = new Set<number>();
  const free = (candidates: number[]) => {
    const open = candidates.filter((n) => !taken.has(n));
    const n = open[pick(0, open.length - 1)];
    taken.add(n);
    return n;
  };
  const all = Array.from({ length: meetups }, (_, k) => k + 1);

  // A meetup with no joiner that the whole group is away from.
  const empty = free(all.filter((n) => meetup(n).people.length === 0));
  meetup(empty).away = before(empty);

  // A meetup the first person in slot order is away from, which leaves its
  // first slot empty. The founders come first, by their first moment, then
  // by slug; a founder's first moment is their first contact.
  const first = [0, 1, 2].sort((a, b) => contactMonth[a] - contactMonth[b] || a - b)[0];
  meetup(free(all)).away = [slugs[first]];

  // A few meetups with one person recorded there and another away.
  for (let k = 0; k < 3; k += 1) {
    const n = free(all);
    const pool = before(n);
    const away = pool[pick(0, pool.length - 1)];
    const rest = pool.filter((slug) => slug !== away);
    meetup(n).away = [away];
    meetup(n).there = [rest[pick(0, rest.length - 1)]];
  }

  // A guest, who never joins, at one or two moments that are not meetups.
  people.push({ slug: "g0", name: "Guest 0", alias: "@g0", member: false });
  moments.find((m) => m.id === "stretch-1")!.people.push("g0");
  if (next() < 0.5) {
    const n = pick(1, meetups);
    const pool = membersAt(n);
    moments.push({
      id: "guest-visit",
      date: month(meetupMonth(n) + 1),
      title: "Guest visit",
      people: ["g0", pool[pick(0, pool.length - 1)]],
      trunk: false,
    });
  }

  // Someone away from a moment that is not a meetup, twice, drawn after the
  // guest so everything above is as it was for a seed. One moment names part
  // of the rest of the group and stays off the ribbon; the other names all of
  // it, and the absence puts it on the ribbon. Each is the month after an
  // even-numbered meetup other than the stretch's, where the group has at
  // least four members, so the part leaves someone out besides whoever is
  // away. Whoever is away joined at an earlier meetup and is not named.
  const evens = all.filter((n) => n % 2 === 0 && n !== stretch);
  for (const whole of [false, true]) {
    const n = evens[pick(0, evens.length - 1)];
    const pool = membersAt(n);
    const away = pool[pick(0, pool.length - 1)];
    const rest = pool.filter((slug) => slug !== away);
    moments.push({
      id: whole ? "away-whole" : "away-part",
      date: month(meetupMonth(n) + 1),
      title: whole ? "Away from the whole" : "Away from a part",
      people: whole ? rest : rest.slice(0, pick(1, rest.length - 2)),
      trunk: false,
      away: [away],
    });
  }

  return { people, moments };
}
