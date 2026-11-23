import test from "node:test";
import assert from "node:assert/strict";
import { avatarFor, flow, hueFor, PALETTE_SIZE } from "../src/render.ts";
import type { DocumentLike, ElementLike } from "../src/render.ts";
import type { Person } from "../src/types.ts";

interface Node {
  tag: string;
  attrs: Record<string, string>;
  children: Node[];
  text: string;
}

/** A recording stand-in for `document`. No DOM library is available here. */
function stubDocument(): { doc: DocumentLike; made: Node[] } {
  const made: Node[] = [];
  const doc: DocumentLike = {
    createElementNS(_ns: string, tag: string): ElementLike {
      const node: Node = { tag, attrs: {}, children: [], text: "" };
      made.push(node);
      const element = {
        node,
        setAttribute(name: string, value: string) {
          node.attrs[name] = value;
        },
        appendChild(child: ElementLike) {
          node.children.push((child as unknown as { node: Node }).node);
          return child;
        },
        set textContent(value: string) {
          node.text = value;
        },
        get textContent() {
          return node.text;
        },
      };
      return element as unknown as ElementLike;
    },
  };
  return { doc, made };
}

function person(slug: string, member: boolean, imageUrl = ""): Person {
  return {
    slug,
    name: slug.toUpperCase(),
    alias: `@${slug}`,
    description: "",
    quote: "",
    imageUrl,
    profileUrl: "",
    member,
  };
}

const DANIEL = person("daniel", true, "https://example.com/d.png");
const ROK = person("rok", false);

// --- faces ------------------------------------------------------------------

test("a person with a picture gets an image", () => {
  const { doc, made } = stubDocument();
  avatarFor(DANIEL, doc);
  assert.ok(made.some((n) => n.tag === "image"));
});

test("a guest with an empty image_url gets an initial, never an image", () => {
  const { doc, made } = stubDocument();
  avatarFor(ROK, doc);
  assert.equal(made.some((n) => n.tag === "image"), false);
  assert.ok(made.some((n) => n.text === "R"));
});

test("member and guest faces are told apart without colour", () => {
  const member = stubDocument();
  avatarFor(DANIEL, member.doc);
  assert.ok(member.made.some((n) => (n.attrs.class ?? "").includes("is-member")));
  const guest = stubDocument();
  avatarFor(ROK, guest.doc);
  assert.ok(guest.made.some((n) => (n.attrs.class ?? "").includes("is-guest")));
});

test("attribute names are SVG spellings, not underscored", () => {
  // clip_path once shipped; browsers silently ignore it and the face was a
  // square
  for (const who of [DANIEL, ROK]) {
    const { doc, made } = stubDocument();
    avatarFor(who, doc);
    for (const node of made) {
      for (const name of Object.keys(node.attrs)) {
        assert.ok(
          !name.includes("_"),
          `${node.tag} has attribute ${name}; SVG uses hyphens`,
        );
      }
    }
  }
});

test("no attribute is ever emitted as NaN or undefined", () => {
  for (const who of [DANIEL, ROK]) {
    const { doc, made } = stubDocument();
    avatarFor(who, doc);
    for (const node of made) {
      for (const [name, value] of Object.entries(node.attrs)) {
        assert.ok(
          !value.includes("NaN") && !value.includes("undefined"),
          `${node.tag}.${name} = ${value}`,
        );
      }
    }
  }
});

// --- palette ----------------------------------------------------------------

test("past the palette, threads fall back to the muted slot", () => {
  assert.equal(hueFor(0), 0);
  assert.equal(hueFor(PALETTE_SIZE - 1), PALETTE_SIZE - 1);
  assert.equal(hueFor(PALETTE_SIZE), -1);
  assert.equal(hueFor(PALETTE_SIZE + 50), -1);
});

// --- flow -------------------------------------------------------------------

test("a path eases between its points, with no corners", () => {
  const d = flow([[100, 0], [160, 50], [160, 120], [40, 200]], "y");
  assert.ok(d.startsWith("M100,0"));
  assert.equal((d.match(/C/g) ?? []).length, 3, "one cubic per hop");
  assert.ok(!d.includes("L"), `${d} has a corner`);
  assert.ok(d.endsWith(" 40,200"));
});

test("a hop that stays in one column is still straight", () => {
  // control points sit on the time axis, so no change of column, no bulge
  const d = flow([[100, 0], [100, 50]], "y");
  assert.equal(d, "M100,0 C100,25 100,25 100,50");
});

test("subway eases along x instead of y", () => {
  const d = flow([[0, 100], [50, 100]], "x");
  assert.equal(d, "M0,100 C25,100 25,100 50,100");
});

test("an empty path is empty, not a stray M", () => {
  assert.equal(flow([], "y"), "");
});
