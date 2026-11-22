/** Shared shapes for the Origins braid engine. */

export type Precision = "year" | "month" | "day";

/**
 * A date that knows how precise it is. `start` is inclusive and `end`
 * exclusive, both epoch milliseconds in UTC, so a month-precision date spans
 * its whole month rather than pretending to be its first day.
 */
export interface FuzzyDate {
  readonly raw: string;
  readonly start: number;
  readonly end: number;
  readonly precision: Precision;
}

/** A person, from their `content/about/` profile. */
export interface Person {
  readonly slug: string;
  readonly name: string;
  readonly alias: string;
  readonly description: string;
  readonly imageUrl: string;
  readonly profileUrl: string;
  readonly member: boolean;
}

/** One thing that happened, with everyone who was part of it. */
export interface Moment {
  readonly id: string;
  readonly date: FuzzyDate;
  readonly title: string;
  readonly people: readonly string[];
  readonly trunk: boolean;
  readonly blurb?: string;
  readonly photo?: string;
  /** This site's page for the moment, for meetups that have one. */
  readonly permalink?: string;
  /** Somebody else's site, for events like Nix Camp and NixCon. */
  readonly link?: string;
}

/**
 * A moment with its place in the picture. `t` is a rank position in [0, 1]:
 * moments are evenly spaced regardless of the gaps between their dates,
 * because four personal moments span two years while twenty meetups span
 * three. Precision lives on `moment.date`, not in any extent here.
 */
export interface PlacedMoment {
  readonly moment: Moment;
  readonly t: number;
  readonly lane: number;
}

/**
 * A run of a person's thread that gets drawn. The gaps between a thread's
 * segments are where it is travelling inside the trunk and not drawn
 * separately.
 */
export interface ThreadSegment {
  readonly points: readonly PlacedMoment[];
  readonly kind: "approach" | "excursion";
}

export interface Thread {
  readonly person: Person;
  /** Where this person's line originates, even when none of their moments sit there. */
  readonly lane: number;
  readonly segments: readonly ThreadSegment[];
  readonly joinsTrunkAt: string | null;
}

/**
 * A non-trunk moment after the spine starts, naming people already in it.
 * Those threads leave the trunk at `from` and rejoin at `to`, so the detour
 * spans a real interval rather than an instant.
 */
export interface Excursion {
  readonly moment: PlacedMoment;
  readonly lane: number;
  readonly from: PlacedMoment;
  readonly to: PlacedMoment | null;
  readonly leaves: readonly string[];
  readonly recruits: readonly string[];
}

export interface TrunkSegment {
  readonly from: PlacedMoment;
  readonly to: PlacedMoment;
  /** Distinct people who have joined by `from`. */
  readonly joined: number;
  /** How many of them are away on an excursion across this stretch. */
  readonly away: number;
}

export interface Braid {
  readonly moments: readonly PlacedMoment[];
  readonly threads: readonly Thread[];
  readonly trunk: readonly TrunkSegment[];
  readonly excursions: readonly Excursion[];
}
