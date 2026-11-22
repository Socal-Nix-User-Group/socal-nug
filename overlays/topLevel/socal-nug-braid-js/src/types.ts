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
  readonly permalink?: string;
}
