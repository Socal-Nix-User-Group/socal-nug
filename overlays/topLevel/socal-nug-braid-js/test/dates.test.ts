import test from "node:test";
import assert from "node:assert/strict";
import { parseFuzzyDate, formatFuzzyDate } from "../src/dates.ts";

const DAY = 86_400_000;

test("day precision spans one day", () => {
  const d = parseFuzzyDate("2021-10-23");
  assert.equal(d.precision, "day");
  assert.equal(d.end - d.start, DAY);
});

test("month precision spans the whole month", () => {
  const d = parseFuzzyDate("2023-04");
  assert.equal(d.precision, "month");
  assert.equal(new Date(d.start).getUTCMonth(), 3);
  assert.equal(d.end - d.start, 30 * DAY);
});

test("month precision handles february in a leap year", () => {
  const d = parseFuzzyDate("2024-02");
  assert.equal(d.end - d.start, 29 * DAY);
});

test("year precision spans the whole year", () => {
  const d = parseFuzzyDate("2021");
  assert.equal(d.precision, "year");
  assert.equal(d.end - d.start, 365 * DAY);
});

test("start is ordered before end for every precision", () => {
  for (const raw of ["2021", "2023-04", "2021-10-23"]) {
    const d = parseFuzzyDate(raw);
    assert.ok(d.start < d.end, raw);
  }
});

test("raw text is preserved", () => {
  assert.equal(parseFuzzyDate("2023-04").raw, "2023-04");
});

test("formats only the precision it has", () => {
  assert.equal(formatFuzzyDate(parseFuzzyDate("2023-04")), "April 2023");
  assert.equal(formatFuzzyDate(parseFuzzyDate("2021")), "2021");
  assert.equal(
    formatFuzzyDate(parseFuzzyDate("2021-10-23")),
    "23 October 2021",
  );
});

test("rejects an unpadded date", () => {
  assert.throws(() => parseFuzzyDate("2023-4-1"), /2023-4-1/);
});

test("rejects an impossible month", () => {
  assert.throws(() => parseFuzzyDate("2023-13"), /2023-13/);
});

test("rejects an impossible day", () => {
  assert.throws(() => parseFuzzyDate("2023-02-30"), /2023-02-30/);
});

test("rejects empty input", () => {
  assert.throws(() => parseFuzzyDate(""));
});

test("ordering by start matches calendar order", () => {
  const order = ["2021", "2021-10-23", "2023-04", "2023-04-11"]
    .map(parseFuzzyDate)
    .map((d) => d.start);
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});
