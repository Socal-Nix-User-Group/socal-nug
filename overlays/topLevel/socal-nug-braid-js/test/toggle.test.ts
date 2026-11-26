import test from "node:test";
import assert from "node:assert/strict";
import { MODE_KEY, readMode, writeMode } from "../src/toggle.ts";
import type { StorageLike } from "../src/toggle.ts";

function memory(initial: Record<string, string> = {}): StorageLike {
  const store = { ...initial };
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => {
      store[key] = value;
    },
  };
}

const hostile: StorageLike = {
  getItem() {
    throw new Error("denied");
  },
  setItem() {
    throw new Error("denied");
  },
};

test("defaults to river when nothing is stored", () => {
  assert.equal(readMode(memory()), "river");
});

test("round-trips a stored mode", () => {
  const storage = memory();
  writeMode(storage, "subway");
  assert.equal(readMode(storage), "subway");
  writeMode(storage, "river");
  assert.equal(readMode(storage), "river");
});

test("reads a mode written by a previous visit", () => {
  assert.equal(readMode(memory({ [MODE_KEY]: "subway" })), "subway");
});

test("returns river when storage throws on read", () => {
  assert.equal(readMode(hostile), "river");
});

test("never throws when storage throws on write", () => {
  assert.doesNotThrow(() => writeMode(hostile, "subway"));
});

test("returns river when there is no storage at all", () => {
  assert.equal(readMode(null), "river");
  assert.doesNotThrow(() => writeMode(null, "subway"));
});

test("ignores a stored value that is not a mode", () => {
  assert.equal(readMode(memory({ [MODE_KEY]: "tube" })), "river");
  assert.equal(readMode(memory({ [MODE_KEY]: "map" })), "river");
  assert.equal(readMode(memory({ [MODE_KEY]: "" })), "river");
});
