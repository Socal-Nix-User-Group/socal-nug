import type { FuzzyDate } from "./types.ts";

const SHAPE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;
const DAY = 86_400_000;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Parse `YYYY`, `YYYY-MM` or `YYYY-MM-DD` into a span that carries its own
 * precision. Anything else throws, because a page about remembering should
 * never invent a day it does not have.
 */
export function parseFuzzyDate(raw: string): FuzzyDate {
  const parts = SHAPE.exec(raw);
  if (!parts) {
    throw new RangeError(
      `bad date ${JSON.stringify(raw)}: use YYYY, YYYY-MM or YYYY-MM-DD`,
    );
  }

  const year = Number(parts[1]);
  const month = parts[2] === undefined ? undefined : Number(parts[2]);
  const day = parts[3] === undefined ? undefined : Number(parts[3]);

  if (month === undefined) {
    return {
      raw,
      precision: "year",
      start: Date.UTC(year, 0, 1),
      end: Date.UTC(year + 1, 0, 1),
    };
  }

  if (month < 1 || month > 12) {
    throw new RangeError(`bad date ${raw}: month out of range`);
  }

  if (day === undefined) {
    return {
      raw,
      precision: "month",
      start: Date.UTC(year, month - 1, 1),
      end: Date.UTC(year, month, 1),
    };
  }

  const start = Date.UTC(year, month - 1, day);
  // Date.UTC rolls over, turning 2023-02-30 into 2023-03-02. Round-trip to
  // catch a day that does not exist in that month.
  const back = new Date(start);
  if (
    back.getUTCFullYear() !== year ||
    back.getUTCMonth() !== month - 1 ||
    back.getUTCDate() !== day
  ) {
    throw new RangeError(`bad date ${raw}: no such day in that month`);
  }

  return { raw, precision: "day", start, end: start + DAY };
}

/** Render a date at exactly the precision it carries, never more. */
export function formatFuzzyDate(date: FuzzyDate): string {
  const at = new Date(date.start);
  const year = at.getUTCFullYear();
  if (date.precision === "year") {
    return String(year);
  }
  const month = MONTHS[at.getUTCMonth()];
  if (date.precision === "month") {
    return `${month} ${year}`;
  }
  return `${at.getUTCDate()} ${month} ${year}`;
}
