import test from "node:test";
import assert from "node:assert/strict";
import { focusOrder, labelFor, nextIndex } from "../src/focus.ts";
import { at, braid, PEOPLE } from "./fake-elk.ts";
import { buildBraid } from "../src/layout.ts";

// The braid is one tab stop. Inside it the arrow keys move through the story
// in the order it happened, which is the same order in both modes: time runs
// down in River and across in Subway, so forward is Down or Right either way.

test("the order is the story's order, a face just before its first moment", () => {
  assert.deepEqual(
    focusOrder(braid).map((t) => `${t.kind}:${t.id}`),
    [
      "person:a",
      "moment:a-root",
      "moment:founded",
      "person:b",
      "moment:camp",
      "moment:nug",
    ],
  );
});

test("every moment and every face is reachable, and nothing twice", () => {
  const order = focusOrder(braid);
  const ids = order.map((t) => `${t.kind}:${t.id}`);
  assert.equal(new Set(ids).size, ids.length, "a target appears twice");
  assert.equal(
    order.filter((t) => t.kind === "moment").length,
    braid.moments.length,
  );
  assert.equal(
    order.filter((t) => t.kind === "person").length,
    braid.threads.length,
  );
});

test("two people starting at one moment both come before it, in thread order", () => {
  const together = buildBraid(
    [
      at("meet", "2021-01", ["a", "b"]),
      at("founded", "2023-01", ["a"], true),
    ],
    PEOPLE,
  );
  assert.deepEqual(
    focusOrder(together).map((t) => `${t.kind}:${t.id}`),
    ["person:a", "person:b", "moment:meet", "moment:founded"],
  );
});

test("forward is down or right, back is up or left", () => {
  assert.equal(nextIndex(2, "ArrowDown", 6), 3);
  assert.equal(nextIndex(2, "ArrowRight", 6), 3);
  assert.equal(nextIndex(2, "ArrowUp", 6), 1);
  assert.equal(nextIndex(2, "ArrowLeft", 6), 1);
});

test("the ends hold rather than wrapping", () => {
  // a timeline has a beginning and an end; wrapping from one to the other
  // loses the reader's place in the story
  assert.equal(nextIndex(0, "ArrowUp", 6), 0);
  assert.equal(nextIndex(5, "ArrowDown", 6), 5);
});

test("Home and End jump to the ends", () => {
  assert.equal(nextIndex(3, "Home", 6), 0);
  assert.equal(nextIndex(3, "End", 6), 5);
});

test("a key the braid does not use is left alone", () => {
  // so Tab still leaves the picture and typing still reaches the page
  assert.equal(nextIndex(3, "Tab", 6), null);
  assert.equal(nextIndex(3, "a", 6), null);
  assert.equal(nextIndex(3, "PageDown", 6), null);
});

test("an empty braid has nowhere to go", () => {
  assert.equal(nextIndex(0, "ArrowDown", 0), null);
});

// --- what a screen reader hears ---------------------------------------------

test("a moment reads as its title and date", () => {
  // a meetup nobody joined at names nobody, so the label stops at the date
  const quiet = buildBraid(
    [
      at("a-root", "2021-01", ["a"]),
      at("founded", "2023-01", ["a"], true),
      at("nug2", "2023-03", [], true),
    ],
    PEOPLE,
  );
  const target = focusOrder(quiet).find((t) => t.id === "nug2")!;
  assert.equal(labelFor(target, quiet), "nug2, March 2023");
});

test("a moment with people says how many, since the card names them", () => {
  const order = focusOrder(braid);
  const camp = order.find((t) => t.id === "camp")!;
  assert.equal(labelFor(camp, braid), "camp, April 2023, 2 people");
});

test("a moment with one person says one person, not 1 people", () => {
  const order = focusOrder(braid);
  const root = order.find((t) => t.id === "a-root")!;
  assert.equal(labelFor(root, braid), "a-root, January 2021, 1 person");
});

test("a face reads as its person, and whether they are a member", () => {
  const order = focusOrder(braid);
  assert.equal(
    labelFor(order.find((t) => t.kind === "person" && t.id === "a")!, braid),
    "A, member",
  );
  assert.equal(
    labelFor(order.find((t) => t.kind === "person" && t.id === "b")!, braid),
    "B, guest",
  );
});
