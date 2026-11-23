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

// --- outside links ----------------------------------------------------------
// A moment can point at more than one place: an outside event and the host it
// ran alongside. Each link carries its own title, so the card can name them.

test("outside links come back as titled records", () => {
  const { moments } = parseData({
    ...PAYLOAD,
    moments: [{
      id: "scale-21x",
      date: "2024-03-14",
      title: "SCaLE 21x / NixCon NA",
      people: ["daniel-baker"],
      links: [
        { title: "NixCon NA", url: "https://2024-na.nixcon.org/" },
        { title: "SCaLE 21x", url: "https://www.socallinuxexpo.org/scale/21x/" },
      ],
    }],
  });
  assert.deepEqual(moments[0].links, [
    { title: "NixCon NA", url: "https://2024-na.nixcon.org/" },
    { title: "SCaLE 21x", url: "https://www.socallinuxexpo.org/scale/21x/" },
  ]);
});

test("a moment with no links has none, not an empty list", () => {
  const { moments } = parseData(PAYLOAD);
  assert.equal(moments[0].links, undefined);
  const { moments: emitted } = parseData({
    ...PAYLOAD,
    moments: [{ ...PAYLOAD.moments[0], links: [] }],
  });
  assert.equal(emitted[0].links, undefined);
});

test("a link without a url is rejected, naming the moment and the field", () => {
  assert.throws(
    () =>
      parseData({
        ...PAYLOAD,
        moments: [{
          id: "x",
          date: "2024",
          title: "X",
          people: [],
          links: [{ title: "Nowhere" }],
        }],
      }),
    /x.*links\[0\]\.url/,
  );
});

test("a person with no quote gets an empty one, not undefined", () => {
  const { people } = parseData(PAYLOAD);
  assert.equal(people.get("daniel-baker")!.quote, "");
});

test("a quote comes through as written, inner quotation marks and all", () => {
  const said = 'I was like "whoa other people use this?"';
  const { people } = parseData({
    ...PAYLOAD,
    people: [{ ...PAYLOAD.people[0], quote: said }],
  });
  assert.equal(people.get("daniel-baker")!.quote, said);
});

test("a meetup's attendance lists come through", () => {
  const { moments } = parseData({ people: [], moments: [{ id: "m", date: "2024-06-01", title: "M", people: [], trunk: true, there: ["a"], away: ["b"] }] });
  assert.deepEqual(moments[0].there, ["a"]);
  assert.deepEqual(moments[0].away, ["b"]);
});

test("absent and empty attendance lists come back undefined", () => {
  const { moments } = parseData({ people: [], moments: [{ id: "m", date: "2024", title: "M", there: [] }] });
  assert.equal(moments[0].there, undefined);
  assert.equal(moments[0].away, undefined);
});

test("an attendance list that is not a list of slugs is rejected, naming the moment", () => {
  assert.throws(() => parseData({ people: [], moments: [{ id: "m", date: "2024", title: "M", away: [3] }] }), /moment m: away/);
});
