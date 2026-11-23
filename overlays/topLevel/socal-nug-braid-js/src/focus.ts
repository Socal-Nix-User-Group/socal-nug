import { formatFuzzyDate } from "./dates.ts";
import type { Gathering } from "./story.ts";
import type { Braid, Person } from "./types.ts";

/**
 * Moving through the braid by keyboard.
 *
 * The picture is one tab stop. Inside it the arrow keys move through the
 * story in the order it happened, and only the target under the cursor is
 * tabbable: a roving tabindex. Forty-six separate tab stops in the middle of
 * a page is a wall to anyone tabbing past it, which is the reason for the
 * pattern rather than plain focusable dots.
 *
 * The order is the same in both modes. Time runs down in River and across in
 * Subway, so forward is Down or Right either way and nobody has to think
 * about which projection they are in.
 */

export interface FocusTarget {
  /** A moment's id, or a person's slug. */
  readonly id: string;
  readonly kind: "moment" | "person";
}

/** Every focusable thing, in the order the story happened. */
export function focusOrder(braid: Braid): readonly FocusTarget[] {
  // A face belongs a step ahead of its person's first moment, which is where
  // it is drawn, so that is where it sits in the order too.
  const facesAt = new Map<string, string[]>();
  for (const thread of braid.threads) {
    const first = thread.segments[0]?.points[0];
    if (first === undefined) continue;
    const at = facesAt.get(first.moment.id) ?? [];
    at.push(thread.person.slug);
    facesAt.set(first.moment.id, at);
  }

  const order: FocusTarget[] = [];
  for (const placed of braid.moments) {
    for (const slug of facesAt.get(placed.moment.id) ?? []) {
      order.push({ id: slug, kind: "person" });
    }
    order.push({ id: placed.moment.id, kind: "moment" });
  }
  return order;
}

/**
 * Where a key takes the cursor, or null when the braid does not use that key.
 * Null matters: it leaves Tab to leave the picture and everything else to
 * reach the page.
 */
export function nextIndex(
  current: number,
  key: string,
  count: number,
): number | null {
  if (count === 0) return null;
  const last = count - 1;
  // The ends hold rather than wrapping: a timeline has a beginning and an
  // end, and jumping from one to the other loses the reader's place.
  switch (key) {
    case "ArrowDown":
    case "ArrowRight":
      return Math.min(current + 1, last);
    case "ArrowUp":
    case "ArrowLeft":
      return Math.max(current - 1, 0);
    case "Home":
      return 0;
    case "End":
      return last;
    default:
      return null;
  }
}

/** What a screen reader says when the cursor lands on something. */
export function labelFor(target: FocusTarget, braid: Braid): string {
  if (target.kind === "person") {
    const thread = braid.threads.find((t) => t.person.slug === target.id);
    if (thread === undefined) return target.id;
    return `${thread.person.name}, ${
      thread.person.member ? "member" : "guest"
    }`;
  }

  const placed = braid.moments.find((m) => m.moment.id === target.id);
  if (placed === undefined) return target.id;
  const moment = placed.moment;
  const parts = [moment.title, formatFuzzyDate(moment.date)];
  // How many, not who: eight names read out on every arrow press is a wall,
  // and the card names them for anyone who opens it.
  if (moment.people.length === 1) {
    parts.push("1 person");
  } else if (moment.people.length > 1) {
    parts.push(`${moment.people.length} people`);
  }
  return parts.join(", ");
}

/** What a screen reader says for a gathering: a meetup says how many are in the group. */
export function describeGathering(gathering: Gathering): string {
  const { moment } = gathering;
  const count = moment.trunk
    ? `${gathering.inGroup} in the group`
    : gathering.through.length === 1
      ? "1 person"
      : `${gathering.through.length} people`;
  return `${moment.title}, ${formatFuzzyDate(moment.date)}, ${count}`;
}

/** What a screen reader says for a face. */
export function describePerson(person: Person): string {
  return `${person.name}, ${person.member ? "member" : "guest"}`;
}
