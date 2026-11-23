import { formatFuzzyDate } from "./dates.ts";
import type { Gathering, Story } from "./story.ts";
import type { Person } from "./types.ts";

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
export function focusOrder(story: Story): readonly FocusTarget[] {
  // A face belongs a step ahead of its person's first moment, which is where
  // it is drawn, so that is where it sits in the order too.
  const facesAt = new Map<string, string[]>();
  for (const thread of story.threads) {
    const first = thread.path[0];
    if (first === undefined) continue;
    const at = facesAt.get(first.moment.id) ?? [];
    at.push(thread.person.slug);
    facesAt.set(first.moment.id, at);
  }

  const order: FocusTarget[] = [];
  for (const gathering of story.moments) {
    for (const slug of facesAt.get(gathering.moment.id) ?? []) {
      order.push({ id: slug, kind: "person" });
    }
    order.push({ id: gathering.moment.id, kind: "moment" });
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

/** What a screen reader says for a gathering: a meetup says how many are in the group. */
export function describeGathering(gathering: Gathering): string {
  const { moment } = gathering;
  const when = `${moment.title}, ${formatFuzzyDate(moment.date)}`;
  if (!moment.trunk && gathering.through.length === 0) return when;
  const count = moment.trunk
    ? `${gathering.inGroup} in the group`
    : gathering.through.length === 1
      ? "1 person"
      : `${gathering.through.length} people`;
  return `${when}, ${count}`;
}

/** What a screen reader says for a face. */
export function describePerson(person: Person): string {
  return `${person.name}, ${person.member ? "member" : "guest"}`;
}
