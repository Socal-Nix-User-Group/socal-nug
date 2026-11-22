import test from "node:test";
import assert from "node:assert/strict";
import { parseData } from "../src/parse.ts";

const PAYLOAD = {
  people: [
    {
      slug: "daniel-baker",
      name: "Daniel Baker",
      alias: "@djacu",
      description: "Co-founder.",
      imageUrl: "https://example.com/d.png",
      profileUrl: "https://github.com/djacu",
      member: true,
    },
    {
      slug: "rok-garbas",
      name: "Rok Garbas",
      alias: "@garbas",
      description: "",
      imageUrl: "",
      profileUrl: "https://github.com/garbas",
      member: false,
    },
  ],
  moments: [
    {
      id: "tweag",
      date: "2022-02-21",
      title: "Started at Tweag",
      people: ["daniel-baker"],
    },
    {
      id: "nug1",
      date: "2023-05-30",
      title: "NUG #1",
      people: [],
      trunk: true,
      permalink: "/events/2023-05-30/",
    },
  ],
};

test("people come back keyed by slug", () => {
  const { people } = parseData(PAYLOAD);
  assert.equal(people.size, 2);
  assert.equal(people.get("daniel-baker")!.name, "Daniel Baker");
  assert.equal(people.get("rok-garbas")!.member, false);
});

test("a date string becomes a fuzzy date", () => {
  const { moments } = parseData(PAYLOAD);
  assert.equal(moments[0].date.precision, "day");
  assert.equal(moments[0].date.raw, "2022-02-21");
});

test("trunk defaults to false when absent", () => {
  const { moments } = parseData(PAYLOAD);
  assert.equal(moments[0].trunk, false);
  assert.equal(moments[1].trunk, true);
});

test("optional fields stay undefined rather than empty", () => {
  const { moments } = parseData(PAYLOAD);
  assert.equal(moments[0].blurb, undefined);
  assert.equal(moments[1].permalink, "/events/2023-05-30/");
});

test("rejects a payload that is not an object", () => {
  assert.throws(() => parseData(null), TypeError);
  assert.throws(() => parseData("nope"), TypeError);
});

test("rejects a missing moments array, naming the field", () => {
  assert.throws(() => parseData({ people: [] }), /moments/);
});

test("rejects a missing people array, naming the field", () => {
  assert.throws(() => parseData({ moments: [] }), /people/);
});

test("rejects a moment with no id, naming the field", () => {
  assert.throws(
    () => parseData({ people: [], moments: [{ date: "2021", title: "x" }] }),
    /id/,
  );
});

test("rejects a bad date, naming the moment", () => {
  assert.throws(
    () =>
      parseData({
        people: [],
        moments: [{ id: "oops", date: "2023-4-1", title: "x", people: [] }],
      }),
    /oops/,
  );
});

test("rejects a person with no slug, naming the field", () => {
  assert.throws(
    () => parseData({ people: [{ name: "Nobody" }], moments: [] }),
    /slug/,
  );
});
