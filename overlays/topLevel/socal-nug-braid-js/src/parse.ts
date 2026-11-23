import { parseFuzzyDate } from "./dates.ts";
import type { Link, Moment, Person } from "./types.ts";

/**
 * Turn the page's `#origins-data` JSON into typed records.
 *
 * The template emits dates as raw strings, because Tera has no notion of a
 * date that knows its own precision. This is the only place that gap is
 * crossed, so it is the only place that has to be careful about it.
 */

function asRecord(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${where}: expected an object`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${where}: expected an array`);
  }
  return value;
}

function asString(value: unknown, where: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${where}: expected a string`);
  }
  return value;
}

function optionalString(
  value: unknown,
  where: string,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return asString(value, where);
}

function toPerson(raw: unknown, index: number): Person {
  const where = `people[${index}]`;
  const record = asRecord(raw, where);
  const slug = asString(record.slug, `${where}.slug`);
  return {
    slug,
    name: asString(record.name, `${where}.name`),
    alias: asString(record.alias, `${where}.alias`),
    description: typeof record.description === "string"
      ? record.description
      : "",
    quote: typeof record.quote === "string" ? record.quote : "",
    imageUrl: typeof record.imageUrl === "string" ? record.imageUrl : "",
    profileUrl: typeof record.profileUrl === "string"
      ? record.profileUrl
      : "",
    member: record.member === true,
  };
}

/**
 * Titled outbound links. Absent and empty both come back as undefined, like
 * every other optional field; the template emits `[]` for a moment with none.
 */
function toLinks(raw: unknown, id: string): readonly Link[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  const list = asArray(raw, `moment ${id}: links`);
  if (list.length === 0) return undefined;
  return list.map((entry, i) => {
    const where = `moment ${id}: links[${i}]`;
    const record = asRecord(entry, where);
    return {
      title: asString(record.title, `${where}.title`),
      url: asString(record.url, `${where}.url`),
    };
  });
}

function toMoment(raw: unknown, index: number): Moment {
  const where = `moments[${index}]`;
  const record = asRecord(raw, where);
  const id = asString(record.id, `${where}.id`);
  const rawDate = asString(record.date, `moment ${id}: date`);

  let date;
  try {
    date = parseFuzzyDate(rawDate);
  } catch (cause) {
    throw new TypeError(
      `moment ${id}: ${(cause as Error).message}`,
      { cause },
    );
  }

  return {
    id,
    date,
    title: asString(record.title, `moment ${id}: title`),
    people: asArray(record.people ?? [], `moment ${id}: people`).map(
      (slug, i) => asString(slug, `moment ${id}: people[${i}]`),
    ),
    trunk: record.trunk === true,
    blurb: optionalString(record.blurb, `moment ${id}: blurb`),
    photo: optionalString(record.photo, `moment ${id}: photo`),
    permalink: optionalString(record.permalink, `moment ${id}: permalink`),
    links: toLinks(record.links, id),
  };
}

export function parseData(raw: unknown): {
  people: ReadonlyMap<string, Person>;
  moments: readonly Moment[];
} {
  const root = asRecord(raw, "origins data");
  const people = asArray(root.people, "origins data: people").map(toPerson);
  const moments = asArray(root.moments, "origins data: moments").map(toMoment);
  return {
    people: new Map(people.map((p) => [p.slug, p])),
    moments,
  };
}
