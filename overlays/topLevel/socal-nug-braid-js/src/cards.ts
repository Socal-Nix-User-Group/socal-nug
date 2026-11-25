import { formatFuzzyDate } from "./dates.ts";
import { hueFor } from "./palette.ts";
import type { DocumentLike, ElementLike } from "./render.ts";
import type { Gathering, Story, Thread } from "./story.ts";
import type { Person } from "./types.ts";

const XHTML = "http://www.w3.org/1999/xhtml";

export interface JoinLine {
  readonly title: string;
  readonly date: string;
}

/**
 * Where a person joined, taken from the moment they joined at. No
 * meeting number: the event titles are not uniform enough to parse one out,
 * and a first trunk moment need not be a meetup at all.
 */
export function joinLineFor(
  thread: Thread,
  moments: readonly Gathering[],
): JoinLine | null {
  if (thread.joinsTrunkAt === null) {
    return null;
  }
  const gathering = moments.find((m) => m.moment.id === thread.joinsTrunkAt);
  if (gathering === undefined) {
    return null;
  }
  return {
    title: gathering.moment.title,
    date: formatFuzzyDate(gathering.moment.date),
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
 * The card for one moment: in the list of moments, and in the popup a click
 * on its node opens where that list is under the map.
 *
 * Click rather than hover, because these carry a photo and a paragraph and a
 * link: things a reader wants to dwell on and click into, which a card that
 * vanishes on mouse-out cannot offer. Hover is spent on lighting the thread
 * of everyone through the moment instead.
 */
export function detailFor(
  gathering: Gathering,
  people: ReadonlyMap<string, Person>,
  doc: DocumentLike,
  /**
   * The popup opens over the picture and needs a way to shut it. The list of
   * moments covers nothing, so an X there would be a button that does nothing.
   */
  dismissable = true,
): ElementLike {
  const moment = gathering.moment;
  const card = el(doc, "div", {
    class: moment.trunk ? "origins-detail-card is-trunk" : "origins-detail-card",
    "data-moment": moment.id,
  });

  const head = el(doc, "div", {
    class: moment.avatar === undefined
      ? "origins-detail-head"
      : "origins-detail-head has-avatar",
  });
  if (moment.avatar !== undefined) {
    // The event's own mark beside its name, as a person's face is beside
    // theirs. The title says which event, so the picture says nothing more.
    head.appendChild(
      el(doc, "img", {
        class: "origins-detail-avatar",
        src: moment.avatar,
        alt: "",
        width: "44",
        height: "44",
      }),
    );
  }
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
  if (dismissable) head.appendChild(dismissFor(doc));
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

  const namesOf = (slugs: readonly string[]) =>
    slugs
      .map((slug) => people.get(slug)?.name)
      .filter((name): name is string => name !== undefined);
  const line = (prefix: string, names: readonly string[]) => {
    if (names.length === 0) return;
    card.appendChild(
      el(doc, "p", { class: "origins-detail-people" }, `${prefix}${names.join(", ")}`),
    );
  };
  // A thread through a meetup says "in the group then", not "was there", so
  // a meetup names only who joined there and who the record confirms. Who
  // was away is said by their thread breaking either side of the oval, with
  // a hollow bead in their slot.
  if (moment.trunk) {
    line("Joined here: ", namesOf(
      gathering.through.filter((p) => p.joined).map((p) => p.slug),
    ));
    line("Confirmed there: ", namesOf(
      gathering.through.filter((p) => p.vouched && !p.joined).map((p) => p.slug),
    ));
  } else {
    line("", namesOf(moment.people));
  }

  // A meetup links to its own page here. An outside event links to whoever
  // runs it, and to the host it ran alongside when there was one: PlanetNix
  // and SCaLE are one moment and two places, so each link carries a name.
  if (moment.permalink !== undefined && moment.permalink !== "") {
    card.appendChild(
      el(
        doc,
        "a",
        { class: "origins-detail-link", href: moment.permalink },
        "Event page",
      ),
    );
  }
  for (const link of moment.links ?? []) {
    card.appendChild(
      el(doc, "a", {
        class: "origins-detail-link",
        href: link.url,
        rel: "noopener",
        target: "_blank",
      }, link.title),
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
  story: Story,
  doc: DocumentLike,
  /**
   * The popup opens over the picture and needs a way to shut it. The roster
   * covers nothing, so an X there would be a button that does nothing.
   */
  dismissable = true,
): ElementLike {
  const person = thread.person;
  const kind = person.member ? "is-member" : "is-guest";
  // Same palette slot the thread uses, so the card and the line match.
  const card = el(doc, "div", {
    class: `origins-card ${kind}`,
    "data-person": person.slug,
    "data-hue": String(hueFor(story.threads.indexOf(thread))),
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

  if (person.quote !== "") {
    // Their words, marked up as theirs. A description is prose about
    // somebody and reads as the site talking; a quote reads as them.
    body.appendChild(
      el(doc, "blockquote", { class: "origins-card-quote" }, person.quote),
    );
  }

  if (person.description !== "") {
    body.appendChild(
      el(doc, "p", { class: "origins-card-desc" }, person.description),
    );
  }

  if (person.links.length > 0) {
    // Their own sites, on one line that wraps. Plain links like the alias
    // above them, which goes to their GitHub.
    const links = el(doc, "div", { class: "origins-card-links" });
    for (const link of person.links) {
      links.appendChild(
        el(doc, "a", { class: "origins-card-link", href: link.url }, link.title),
      );
    }
    body.appendChild(links);
  }

  body.appendChild(
    el(
      doc,
      "span",
      { class: `origins-badge ${kind}` },
      person.member ? "Member" : "Guest",
    ),
  );

  const join = joinLineFor(thread, story.moments);
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
  if (dismissable) card.appendChild(dismissFor(doc));
  return card;
}

/**
 * Everyone, as a grid of the same cards.
 *
 * This is the roster rail returning in a different shape. It went when River
 * needed every pixel of its width; ELK's layout is narrower than the lane
 * allocator's was, so there is room beside the picture again. A list, because
 * that is what it is, and in thread order so it matches the palette.
 */
export function rosterFor(story: Story, doc: DocumentLike): ElementLike {
  const list = el(doc, "ul", { class: "origins-roster" });
  for (const thread of story.threads) {
    const item = el(doc, "li", { class: "origins-roster-item" });
    item.appendChild(personCardFor(thread, story, doc, false));
    list.appendChild(item);
  }
  return list;
}

/** Every moment, in the story's order, as a list of the cards its popup shows. */
export function momentsFor(
  story: Story,
  people: ReadonlyMap<string, Person>,
  doc: DocumentLike,
): ElementLike {
  const list = el(doc, "ul", { class: "origins-moments" });
  for (const gathering of story.moments) {
    const item = el(doc, "li", { class: "origins-moments-item" });
    item.appendChild(detailFor(gathering, people, doc, false));
    list.appendChild(item);
  }
  return list;
}

/** The two panes the rail holds: People over the roster, Moments over the list of moments. */
export function listsFor(
  story: Story,
  people: ReadonlyMap<string, Person>,
  doc: DocumentLike,
): readonly ElementLike[] {
  const pane = (kind: string, title: string, list: ElementLike) => {
    const section = el(doc, "section", { class: `origins-pane ${kind}` });
    section.appendChild(el(doc, "h2", { class: "origins-pane-title" }, title));
    section.appendChild(list);
    return section;
  };
  return [
    pane("is-people", "People", rosterFor(story, doc)),
    pane("is-moments", "Moments", momentsFor(story, people, doc)),
  ];
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
