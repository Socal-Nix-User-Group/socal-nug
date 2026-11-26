import { parseFuzzyDate } from "../src/dates.ts";
import { buildStory } from "../src/story.ts";
import type { Moment, Person } from "../src/types.ts";

export function person(slug: string, member = true): Person {
  return {
    slug,
    name: slug.toUpperCase(),
    alias: `@${slug}`,
    description: "",
    quote: "",
    imageUrl: "",
    profileUrl: "",
    links: [],
    member,
    organizer: false,
  };
}

export function at(
  id: string,
  date: string,
  people: string[],
  trunk = false,
  more: Partial<Moment> = {},
): Moment {
  return { id, date: parseFuzzyDate(date), title: id, people, trunk, ...more };
}

export const PEOPLE = new Map(["rob", "daniel", "david", "jared", "mica", "connor", "morgan"].map((s) => [s, person(s)]));

/**
 * Rob is at a root before the group exists, Daniel, David and Rob found it,
 * one person joins at each of the next meetups, Daniel and Rob go to a camp,
 * the whole group goes to a conference where Connor is a visitor, and Connor
 * joins at the last meetup. Rob is recorded away from the third meetup and
 * Daniel as there.
 */
export const MOMENTS: Moment[] = [
  at("rob-nix", "2018-07", ["rob"]),
  at("booth", "2023-03", ["daniel", "rob", "david", "mica"]),
  at("founded", "2023-04", ["daniel", "david", "rob"], true),
  at("nug1", "2023-05", ["jared"], true),
  at("nug2", "2023-07", ["mica"], true),
  at("camp", "2023-09", ["daniel", "rob"]),
  at("nug3", "2024-01", [], true, { there: ["daniel"], away: ["rob"] }),
  at("scale", "2024-03", ["daniel", "david", "rob", "jared", "mica", "connor"]),
  at("nug4", "2024-06", ["connor"], true),
];

export const story = buildStory(MOMENTS, PEOPLE);

/** The same story, with the camp carrying its own mark. */
export const marked = buildStory(
  MOMENTS.map((m) => (m.id === "camp" ? { ...m, avatar: "/images/moments/camp.png" } : m)),
  PEOPLE,
);
