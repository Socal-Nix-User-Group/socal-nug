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
  /** Their own words, shown as a quotation. Prose about them is `description`. */
  readonly quote: string;
  readonly imageUrl: string;
  readonly profileUrl: string;
  /** Their own sites. `profileUrl` is their GitHub; these are anywhere else. */
  readonly links: readonly Link[];
  readonly member: boolean;
  /** A member who organizes the group. Their badge says so in place of "Member". */
  readonly organizer: boolean;
}

/** One thing that happened, with everyone who was part of it. */
export interface Moment {
  readonly id: string;
  readonly date: FuzzyDate;
  readonly title: string;
  readonly people: readonly string[];
  readonly trunk: boolean;
  /**
   * A line over the blurb that says what the moment was in a few words, as
   * a chapter has a title. The card sets it apart from the blurb.
   */
  readonly heading?: string;
  /** What happened, in sentences. A blank line in it starts a new paragraph. */
  readonly blurb?: string;
  readonly photo?: string;
  /**
   * The event's own mark, a site path to a square image meant to be shown in
   * a circle: what a face is to a person. A photo is of the day; this is the
   * same for every year an event keeps its mark.
   */
  readonly avatar?: string;
  /** This site's page for the moment, for meetups that have one. */
  readonly permalink?: string;
  /**
   * Somebody else's sites, for events like Nix Camp and NixCon. A list,
   * because one moment can be two places at once: PlanetNix ran alongside
   * SCaLE 22x, and the card names each.
   */
  readonly links?: readonly Link[];
  /** Slugs of the members a meetup's records vouch for being there. */
  readonly there?: readonly string[];
  /**
   * Slugs of the people the moment's records say were not there, at a meetup
   * or any other moment.
   */
  readonly away?: readonly string[];
}

/** One outbound link, named so a card can tell two apart. */
export interface Link {
  readonly title: string;
  readonly url: string;
}
