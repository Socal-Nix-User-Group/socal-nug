import { formatFuzzyDate } from "./dates.ts";
import { hueFor } from "./render.ts";
import type { DocumentLike, ElementLike } from "./render.ts";
import type { Braid, Person, PlacedMoment, Thread } from "./types.ts";

const XHTML = "http://www.w3.org/1999/xhtml";

export interface JoinLine {
  readonly title: string;
  readonly date: string;
}

/**
 * Where a person joined, taken from the moment their thread merges at. No
 * meeting number: the event titles are not uniform enough to parse one out,
 * and a first trunk moment need not be a meetup at all.
 */
export function joinLineFor(
  thread: Thread,
  moments: readonly PlacedMoment[],
): JoinLine | null {
  if (thread.joinsTrunkAt === null) {
    return null;
  }
  const placed = moments.find((m) => m.moment.id === thread.joinsTrunkAt);
  if (placed === undefined) {
    return null;
  }
  return {
    title: placed.moment.title,
    date: formatFuzzyDate(placed.moment.date),
  };
}

function el(
  doc: DocumentLike,
  tag: string,
  attrs: Record<string, string> = {},
  text?: string,
): ElementLike {
  const node = doc.createElementNS(XHTML, tag);
  for (const [name, value] of Object.entries(attrs)) {
    node.setAttribute(name, value);
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

/**
 * The card for one moment, shown when its node is clicked.
 *
 * Click rather than hover, because these carry a photo and a paragraph and a
 * link: things a reader wants to dwell on and click into, which a card that
 * vanishes on mouse-out cannot offer. Hover is spent on highlighting who was
 * there instead.
 */
export function detailFor(
  placed: PlacedMoment,
  people: ReadonlyMap<string, Person>,
  doc: DocumentLike,
): ElementLike {
  const moment = placed.moment;
  const card = el(doc, "div", {
    class: "origins-detail-card",
    "data-moment": moment.id,
  });

  const head = el(doc, "div", { class: "origins-detail-head" });
  head.appendChild(
    el(doc, "span", { class: "origins-detail-title" }, moment.title),
  );
  head.appendChild(
    el(
      doc,
      "span",
      { class: "origins-detail-date" },
      formatFuzzyDate(moment.date),
    ),
  );
  head.appendChild(dismissFor(doc));
  card.appendChild(head);

  if (moment.photo !== undefined && moment.photo !== "") {
    card.appendChild(
      el(doc, "img", {
        class: "origins-detail-photo",
        src: moment.photo,
        alt: "",
        loading: "lazy",
      }),
    );
  }

  if (moment.blurb !== undefined && moment.blurb !== "") {
    card.appendChild(
      el(doc, "p", { class: "origins-detail-blurb" }, moment.blurb),
    );
  }

  const names = moment.people
    .map((slug) => people.get(slug)?.name)
    .filter((name): name is string => name !== undefined);
  if (names.length > 0) {
    card.appendChild(
      el(doc, "p", { class: "origins-detail-people" }, names.join(", ")),
    );
  }

  // A meetup links to its own page here; an outside event like Nix Camp or
  // NixCon links to whoever runs it.
  if (moment.permalink !== undefined && moment.permalink !== "") {
    card.appendChild(
      el(
        doc,
        "a",
        { class: "origins-detail-link", href: moment.permalink },
        "Event page",
      ),
    );
  } else if (moment.link !== undefined && moment.link !== "") {
    card.appendChild(
      el(doc, "a", {
        class: "origins-detail-link",
        href: moment.link,
        rel: "noopener",
        target: "_blank",
      }, "Visit the site"),
    );
  }

  return card;
}

/**
 * The card for one person, shown when their avatar is clicked.
 *
 * This replaced a roster rail beside the map. The rail cost River a 20rem
 * column it could not spare once the lanes were wide enough to read, and
 * everything it said about a person is said just as well next to their face.
 */
export function personCardFor(
  thread: Thread,
  braid: Braid,
  doc: DocumentLike,
): ElementLike {
  const person = thread.person;
  const kind = person.member ? "is-member" : "is-guest";
  // Same palette slot the thread uses, so the card and the line match.
  const card = el(doc, "div", {
    class: `origins-card ${kind}`,
    "data-person": person.slug,
    "data-hue": String(hueFor(braid.threads.indexOf(thread))),
  });

  if (person.imageUrl !== "") {
    card.appendChild(
      el(doc, "img", {
        class: "origins-card-avatar",
        src: person.imageUrl,
        alt: "",
        loading: "lazy",
        width: "48",
        height: "48",
      }),
    );
  } else {
    card.appendChild(
      el(
        doc,
        "span",
        { class: "origins-card-avatar is-blank", "aria-hidden": "true" },
        person.name.slice(0, 1).toUpperCase(),
      ),
    );
  }

  const body = el(doc, "div", { class: "origins-card-body" });
  body.appendChild(
    el(doc, "span", { class: "origins-card-name" }, person.name),
  );
  body.appendChild(
    el(
      doc,
      "a",
      { class: "origins-card-alias", href: person.profileUrl },
      person.alias,
    ),
  );

  if (person.description !== "") {
    body.appendChild(
      el(doc, "p", { class: "origins-card-desc" }, person.description),
    );
  }

  body.appendChild(
    el(
      doc,
      "span",
      { class: `origins-badge ${kind}` },
      person.member ? "Member" : "Guest",
    ),
  );

  const join = joinLineFor(thread, braid.moments);
  if (join !== null) {
    body.appendChild(
      el(
        doc,
        "span",
        { class: "origins-card-join" },
        `Joined at ${join.title}, ${join.date}`,
      ),
    );
  }

  card.appendChild(body);
  card.appendChild(dismissFor(doc));
  return card;
}

/** The X in a card's corner. Clicking outside the card closes it as well. */
function dismissFor(doc: DocumentLike): ElementLike {
  return el(doc, "button", {
    class: "origins-dismiss",
    type: "button",
    "data-origins-dismiss": "",
    "aria-label": "Close",
  }, "×");
}
