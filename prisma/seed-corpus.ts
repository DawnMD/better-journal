/**
 * Source text for `prisma/seed.ts`.
 *
 * Data only — no randomness, no database. The generator in seed.ts decides how
 * to assemble these into Plate documents; keeping the two apart means the prose
 * can grow without the generation logic getting harder to read.
 *
 * Everything here is written to give the app's read paths something to chew on:
 *
 *  - Sentences are long and varied so word counts, the words-per-day chart and
 *    `ts_rank` produce a curve rather than a flat line.
 *  - Each topic owns a distinctive vocabulary (`terms`), so a search for
 *    "kimchi" or "tsvector" hits a handful of notes rather than half the corpus.
 *    That is what makes the search palette demoable.
 *  - Headings and quotes exist so seeded documents exercise every block type the
 *    editor supports (see components/editor/plugins/basic-blocks-base-kit.tsx),
 *    not just paragraphs.
 */

export type Topic =
  | "reflection"
  | "work"
  | "reading"
  | "fitness"
  | "travel"
  | "cooking"
  | "learning"
  | "ideas"
  | "gratitude"
  | "dreams";

export type TopicCorpus = {
  /** Headline-style note titles, an alternative to the date-stamped default. */
  headings: string[];
  /** Section headings, used for the h2/h3 blocks inside longer entries. */
  sections: string[];
  /** First paragraph. Sets the scene. */
  openers: string[];
  /** Body paragraphs. Safe to use several of, in any order. */
  middles: string[];
  /** Last paragraph, usually forward-looking. */
  closers: string[];
  /** Pulled into a blockquote block. */
  quotes: string[];
  /**
   * Distinctive words, rendered with the `code` or `kbd` mark and dropped into
   * the odd sentence. Doubles as the search-demo vocabulary.
   */
  terms: string[];
};

export const CORPUS: Record<Topic, TopicCorpus> = {
  reflection: {
    headings: [
      "A slow Sunday",
      "Notes to myself",
      "The week, in one page",
      "Something I keep circling back to",
      "Quiet, and I did not mind it",
      "Re-reading what I wrote in January",
    ],
    sections: ["What happened", "What I noticed", "What I want to try", "Loose ends"],
    openers: [
      "Woke up before the alarm and actually felt rested for once, which is rare enough that I want it written down.",
      "Long day. The kind where the hours blur together and nothing sticks, and by evening I could not name a single thing I had done.",
      "Spent the morning reading on the balcony while it was still cool, and it set the tone for everything after.",
      "Rain all afternoon, so I stayed in and finally cleared the reading pile that has been glaring at me since spring.",
      "Coffee with Priya — first time in months we both had a free evening at the same time, and we talked until the place closed.",
      "Quiet day. Nothing much happened and that turned out to be the best part of it.",
      "Woke up in a bad mood for no reason I can point at, and it took until about two in the afternoon to shake off.",
      "The kind of day that is entirely made of small errands, none of which felt important and all of which needed doing.",
      "Sat in the park for an hour without my phone, which I had been meaning to do for weeks and kept not doing.",
      "Something shifted this week and I cannot tell yet whether it is a real change or just a good stretch of sleep.",
    ],
    middles: [
      "Been thinking about how much of the work is just deciding what not to build, and how badly that maps onto anything you can put in a status update.",
      "Noticed I get more done in ninety focused minutes than in a whole scattered day, and yet I keep scheduling scattered days.",
      "Trying to be more deliberate about when I pick up my phone in the morning. The first twenty minutes seem to set the shape of everything after them.",
      "There is something clarifying about writing a thing down before reacting to it. Half of what feels urgent stops feeling urgent once it is a sentence.",
      "Realised I have been putting off the one task that would unblock three others, which is a pattern I recognise and apparently cannot stop repeating.",
      "Small wins today, but they compounded in a way that felt genuinely good rather than merely productive.",
      "Reminded myself that tired is not the same as stuck, and the two need completely different fixes.",
      "I keep mistaking motion for progress. Reorganising the notes is not the same as writing the thing the notes are for.",
      "Talked myself out of an argument I was rehearsing in the shower, which counts as emotional regulation as far as I am concerned.",
      "The good hours are earlier than I would like them to be, and pretending otherwise has cost me most of this year.",
      "It is easier to be generous when I am rested. Almost everything I dislike about how I behaved this week traces back to sleep.",
      "Wrote out the thing that was bothering me and it turned out to be two separate things wearing one coat.",
    ],
    closers: [
      "Tomorrow: finish the migration, then actually stop at a reasonable hour.",
      "Going to bed early. Genuinely, this time.",
      "Grateful for a slow evening and nothing urgent sitting in the inbox.",
      "Want to keep this rhythm going for the rest of the week and see what it does.",
      "Note to self: ask for help sooner next time. It cost me two days again.",
      "Leaving this here so future me can see whether any of it stuck.",
    ],
    quotes: [
      "You do not rise to the level of your goals, you fall to the level of your systems.",
      "The days are long but the decades are short.",
      "Attention is the rarest and purest form of generosity.",
    ],
    terms: ["margin", "cadence", "attention", "solitude", "friction"],
  },

  work: {
    headings: [
      "Sprint retro",
      "Incident write-up",
      "Migration day",
      "Design review notes",
      "Standup, expanded",
      "Cutover checklist",
      "One-on-one prep",
    ],
    sections: ["What shipped", "What broke", "Decisions", "Follow-ups", "Open questions"],
    openers: [
      "Deployment went out at 3pm and nothing caught fire, which felt suspicious right up until it did catch fire at 5.",
      "Stuck on the same bug since yesterday. Stepping away helped more than staring at it ever did.",
      "Spent most of the day in review rather than writing anything, and the queue is finally under ten.",
      "Paged at 04:12 for a queue backlog that turned out to be a single stuck consumer holding a lock.",
      "Kicked off the index migration on the replica first, which is the only reason today did not become an incident.",
      "Long planning session. We finally cut the scope in half and everyone visibly relaxed.",
      "Pairing all morning on the search ranking, and it went far better than doing it alone would have.",
      "Rewrote the part of the importer I have been apologising for since February.",
    ],
    middles: [
      "The tricky part was never the code, it was agreeing on what correct meant. Once we wrote the definition down the implementation took an afternoon.",
      "Moved the aggregation into Postgres instead of counting rows in JavaScript. Latency went from roughly 900ms to under 40 on the same data.",
      "The GIN index is slower to write and dramatically faster to read, which is exactly the trade we want for something read far more often than written.",
      "Turned out the timezone bug was real: entries written after midnight local were being filed under the previous day because the boundary was cut in UTC.",
      "Added the ownership predicate to the write itself rather than checking first, so there is no window where the row could change hands in between.",
      "We keep paying for the abstraction we added to avoid a duplication that never actually showed up.",
      "Argued for deleting the feature rather than fixing it, and to my genuine surprise everyone agreed within ten minutes.",
      "Wrote the test that would have caught this in November. Not satisfying, but it is the part that stops it happening a third time.",
      "The generated column means the index can never fall behind the row, which a trigger or an application-maintained field absolutely can.",
      "Spent an hour on a query plan and found a sequential scan hiding behind a function call on the indexed column.",
      "Estimation went badly again. We are consistently wrong by the same factor, so at least the error is calibratable.",
      "Half the review comments were about naming, and honestly the names were the problem.",
    ],
    closers: [
      "Tomorrow: land the backfill, then write the runbook while it is still fresh.",
      "Follow-up: alert on consumer lag, not just queue depth.",
      "Next: delete the compatibility shim now that nothing reads it.",
      "Owe the team a summary of the decision and the two options we rejected.",
      "Blocked on review, so picking up the smaller thing in the meantime.",
    ],
    quotes: [
      "Make it work, make it right, make it fast — in that order, and rarely all in one week.",
      "Every line of code is a liability. The cheapest feature is the one we talked ourselves out of.",
      "If it is not in the runbook, it does not exist at three in the morning.",
    ],
    terms: [
      "tsvector",
      "pg_stat_statements",
      "backfill",
      "idempotent",
      "replica lag",
      "connection pool",
      "cascade",
      "rollback",
    ],
  },

  reading: {
    headings: [
      "Finished it",
      "Halfway through and undecided",
      "Essay notes",
      "Abandoned at page 80",
      "Two books at once, badly",
      "Marginalia",
    ],
    sections: ["Summary", "What stayed with me", "Disagreements", "Quotes worth keeping"],
    openers: [
      "Finished the Le Guin collection tonight and immediately wanted to start it again from the first story.",
      "Forty pages into the new Barbara Kingsolver and the voice has already got hold of me.",
      "Gave up on the productivity book at chapter three. It says the same thing eleven times in different fonts.",
      "Read the whole essay standing up in the kitchen because I did not want to sit down and lose the thread.",
      "Reread the middle section of Seeing Like a State, which lands very differently now that I work on systems for a living.",
      "Picked up a secondhand copy of Piranesi for eighty rupees and read half of it on the train home.",
    ],
    middles: [
      "The argument is that legibility is not neutral: the act of measuring a thing reshapes the thing to be measurable. That is uncomfortably close to my day job.",
      "What I liked was how little it explains. The book trusts you to sit with not knowing for a hundred pages, and then it pays it off in a single line.",
      "The prose is doing something I want to steal — short declarative sentences, then one long one that suddenly opens up.",
      "I disagree with the central claim but the book is better for making the case honestly rather than hedging it into mush.",
      "Kept a running list of the words I had to look up. Fourteen so far, which is either humbling or a sign of a show-off editor.",
      "The chapter on attention was worth the whole book, and I suspect the rest exists so the chapter can be sold as one.",
      "Highlighted so much of this that highlighting has stopped conveying information.",
      "It is a book about grief pretending to be a book about gardening, and it does not admit this until very late.",
    ],
    closers: [
      "Next up: the Ursula Franklin lectures, which have been on the shelf for a year.",
      "Want to write a proper summary of this one while it is still warm.",
      "Lending this to Priya, with instructions to skip the introduction.",
      "Three books going at once now, which historically means I finish none of them.",
    ],
    quotes: [
      "We will not know unless we begin.",
      "The trouble is that once you see it, you can't unsee it.",
      "A book is a heart that only beats in the chest of another.",
    ],
    terms: ["marginalia", "epigraph", "translation", "footnotes", "essay collection"],
  },

  fitness: {
    headings: [
      "Long run",
      "Easy shakeout",
      "Intervals, badly paced",
      "Rest day, taken properly",
      "Race report",
      "Back after a week off",
    ],
    sections: ["Session", "How it felt", "Body check", "Next week"],
    openers: [
      "Ran six kilometres and regretted roughly the last two of them, mostly because I went out far too fast.",
      "Twelve kilometres along the lake before the heat arrived, and the last three were the best of the lot.",
      "Rest day, and I actually rested instead of finding a way to make it a light session.",
      "Intervals this morning: eight by four hundred, and the last two fell apart completely.",
      "First proper session since the calf strain and it held up fine, which is a relief I did not expect to feel so strongly.",
      "Swam instead of running because the knee was complaining, and it turns out I still hate swimming.",
    ],
    middles: [
      "Heart rate sat about eight beats higher than usual for the same pace, which normally means sleep rather than fitness.",
      "Negative split by about forty seconds, entirely by accident, because the first half felt awful and the second did not.",
      "Legs felt heavy for the first fifteen minutes and then completely fine, which is a pattern I should stop panicking about.",
      "Cadence hovered around 172, up from the 164 I was stuck at all winter.",
      "Started doing the boring hip work three times a week and the knee thing has, remarkably, gone quiet.",
      "The heat is the whole story at the moment. Same effort, ninety seconds a kilometre slower, and no point pretending otherwise.",
      "Ate properly beforehand for once and the difference in the last third was not subtle.",
    ],
    closers: [
      "Next: keep the easy runs actually easy. That is the whole plan.",
      "Target for the month: three sessions a week, no heroics.",
      "Booking the half in October, which makes it real.",
      "Rest tomorrow, then a long one on Sunday if the weather holds.",
    ],
    quotes: [
      "The easy days should be easy so the hard days can be hard.",
      "Consistency beats intensity, right up until it becomes intensity.",
    ],
    terms: ["cadence", "negative split", "tempo", "zone two", "taper", "mobility"],
  },

  travel: {
    headings: [
      "First day",
      "Getting lost on purpose",
      "The long train",
      "Last morning",
      "Food notes",
      "Everything went wrong, pleasantly",
    ],
    sections: ["Where", "What we ate", "Worth returning for", "Logistics"],
    openers: [
      "Landed at six in the morning, dropped the bags, and walked until the city started making sense.",
      "Took the slow train up the coast, six hours, and I would do it again tomorrow.",
      "Missed the connection, which meant an unplanned night in a town I had never heard of and now think about weekly.",
      "Rain the whole first day, so we did museums and ate too much and it was perfect.",
      "Walked about twenty-two kilometres today without meaning to, following a river that kept promising a bridge.",
      "The hostel is above a bakery, which is either the best or the worst possible arrangement.",
    ],
    middles: [
      "The best meal of the trip cost less than the coffee at the airport, which is a rule I keep rediscovering.",
      "Nobody spoke much English and my forty words were doing enormous work, mostly through goodwill on their side.",
      "Spent the afternoon in a second-hand bookshop where the owner insisted I take a book I could not read.",
      "The old town is beautiful and empties completely at nine, when everyone goes back to the newer part where people actually live.",
      "Ferry timetables here are a rumour rather than a schedule, and once I accepted that the day got much better.",
      "Sat by the harbour for two hours doing absolutely nothing, which was the point of the whole trip.",
    ],
    closers: [
      "Back on the road at seven. One more town, then the flight.",
      "Coming back in autumn, when it is cooler and the coast is empty.",
      "Home tomorrow, and I already miss the bakery downstairs.",
    ],
    quotes: [
      "A good traveller has no fixed plans and is not intent on arriving.",
      "You can't see anything from a car; you've got to get out.",
    ],
    terms: ["overnight ferry", "hostel", "night train", "harbour", "market square", "guesthouse"],
  },

  cooking: {
    headings: [
      "Sunday cooking",
      "Failed, edible",
      "Batch day",
      "Someone else's recipe, adjusted",
      "Fridge clearance",
    ],
    sections: ["What I made", "Changes", "Next time"],
    openers: [
      "Cooked properly for the first time this week instead of ordering in, and it took forty minutes rather than the two hours I had feared.",
      "Made the dal with the tempering done last, which is apparently the whole difference.",
      "Attempted focaccia. The dough was too wet, the crumb was wrong, and everyone ate all of it anyway.",
      "Batch-cooked for the week: rice, a big pot of rajma, and roasted vegetables that will get boring by Thursday.",
      "Started a jar of kimchi on the counter and now I check it three times a day like a nervous parent.",
    ],
    middles: [
      "Salting the aubergine actually mattered. I have skipped that step for years on the assumption it was superstition.",
      "Used half the sugar the recipe asked for and it was better, which makes me suspect the recipe was tested on Americans.",
      "The trick with the garlic is lower heat and more patience than feels reasonable — eight minutes, not three.",
      "Ran out of coriander and used mint, which was wrong but interesting, and I might do it on purpose next time.",
      "Sourdough starter is on day nine and finally smells like bread rather than paint.",
      "Toasted the spices whole and ground them after. Enormous difference for thirty seconds of work.",
    ],
    closers: [
      "Next time: less liquid, hotter oven, and start an hour earlier.",
      "Writing this down before I forget the ratio again.",
      "Freezing half of it, which I will forget about until March.",
    ],
    quotes: [
      "If you can read, you can cook. If you can pay attention, you can cook well.",
      "The recipe is a suggestion; the pan is the authority.",
    ],
    terms: ["tempering", "kimchi", "sourdough", "mise en place", "deglaze", "proving"],
  },

  learning: {
    headings: [
      "Rust, day whatever",
      "Postgres internals",
      "Course notes",
      "Finally understood it",
      "Stuck, then unstuck",
    ],
    sections: ["Concept", "Where I got stuck", "What clicked", "To revisit"],
    openers: [
      "Spent the evening on ownership and borrowing and I think it finally clicked, at least until I try to write something real.",
      "Worked through the chapter on query planning and ran every example against a table I filled with a million rows.",
      "Two hours on lifetimes and I have never felt more comprehensively defeated by a compiler.",
      "Read the tsvector documentation properly rather than copying an incantation off a blog post, and it is far simpler than I assumed.",
      "Went back to the linear algebra course I abandoned in March. Starting from chapter one was the right call.",
    ],
    middles: [
      "The insight is that the borrow checker is not restricting what I can do, it is refusing to let me lie about what I am already doing.",
      "Weighting the vector means a title match outranks a body mention, which is the entire difference between search that feels smart and search that feels random.",
      "Wrote the naive version first, measured it, and only then reached for the clever one. The naive version was fine.",
      "Explaining it out loud to nobody in particular found the gap in my understanding within about ninety seconds.",
      "Gaps and islands: subtract the row number from the date and every consecutive run collapses to a constant. Once you see it you cannot unsee it.",
      "Copied the example, broke it deliberately, and learned more from the error messages than from the working version.",
    ],
    closers: [
      "Tomorrow: redo the exercises without looking at the answers.",
      "Revisit in a week and see how much survived.",
      "Next chapter is indexes, which is the one I actually need.",
    ],
    quotes: [
      "If you can't explain it simply, you don't understand it well enough.",
      "The expert has failed more times than the beginner has tried.",
    ],
    terms: ["borrow checker", "gaps and islands", "query plan", "B-tree", "ts_rank", "lifetimes"],
  },

  ideas: {
    headings: [
      "Half an idea",
      "Probably bad",
      "Worth an afternoon",
      "Shower thought",
      "Parked for later",
    ],
    sections: ["The idea", "Why it might work", "Why it probably won't"],
    openers: [
      "Idea: a journal app that shows you what you wrote on this day in previous years, and nothing else on the home screen.",
      "What if the search box also searched the titles of things I have not written yet — a list of open loops.",
      "Small tool: point it at a folder of markdown and it tells you which notes nothing links to.",
      "A reading list that decays. If you have not touched a book in six months it moves itself to an archive and stops nagging.",
      "Idea for work: a dashboard that only shows what changed since you last looked at it.",
    ],
    middles: [
      "The hard part is not the feature, it is that nobody wants a fourth place to put things.",
      "It only works if the input is something the person already produces. Anything that needs new habits dies in week two.",
      "Could probably build the ugly version in a weekend, which is the only version worth building to find out if it is useful.",
      "This is the third time I have written down some version of this idea, which is either signal or an obsession.",
      "The interesting constraint is doing it without a server, entirely in the browser, so there is nothing to run and nothing to trust.",
    ],
    closers: [
      "Parking this. Revisit if it survives a month of not thinking about it.",
      "Sketched the screen on paper; it needs one view, not four.",
      "If it still seems good next weekend I will build the ugly version.",
    ],
    quotes: [
      "Ideas are cheap. The expensive part is the year of caring about one.",
      "Write it down. The mind is for having ideas, not holding them.",
    ],
    terms: ["prototype", "weekend build", "constraint", "throwaway", "sketch"],
  },

  gratitude: {
    headings: ["Three things", "Small and good", "Today, specifically"],
    sections: ["Today"],
    openers: [
      "Grateful for: the first cold morning of the year, a working laptop, and someone holding the lift.",
      "Three things: filter coffee, a train that arrived, and the cat next door deciding I was acceptable.",
      "Today: my sister called for no reason, which she never does, and we talked for an hour.",
      "Good things: a quiet office, a bug that turned out to be mine and therefore fixable, and rain after eight in the evening.",
      "Small and good: the bakery had the seeded loaf, and the walk home was still light.",
    ],
    middles: [
      "It is a stupidly effective exercise. Three things, ninety seconds, and the day looks measurably different afterwards.",
      "Trying to be specific rather than general. Family is not a thing I am grateful for; the phone call at 6pm is.",
      "Some days the list is genuinely hard to fill and those are the days it does the most work.",
    ],
    closers: [
      "That is the list. Short one today, and that is fine.",
      "Same time tomorrow.",
    ],
    quotes: [
      "Enough is a decision, not an amount.",
      "Attention is the beginning of devotion.",
    ],
    terms: ["specificity", "small things", "noticing"],
  },

  dreams: {
    headings: [
      "Before it goes",
      "Recurring, again",
      "Fragment",
      "Very long, mostly gone",
    ],
    sections: ["What I remember", "Fragments"],
    openers: [
      "Writing this down at 5am before it goes: a house with one more room than it should have, and everyone acting as though this was normal.",
      "The recurring one again — the exam I have not studied for, except this time I was also somehow teaching the course.",
      "Fragment: a train station made entirely of libraries, and I kept missing departures because I stopped to read.",
      "Long one, and most of it is already gone. Something about a flooded street and being very calm about it.",
    ],
    middles: [
      "The strange part was not the impossible geography, it was how ordinary it felt while it was happening.",
      "Woke up at the moment it turned, which is annoying, because the turn is the only interesting bit.",
      "I have written down a version of this three times now, and the details drift each time.",
    ],
    closers: [
      "Going back to sleep. Half past five is not a time.",
      "Noting it in case the pattern means anything later.",
    ],
    quotes: ["We are such stuff as dreams are made on."],
    terms: ["recurring", "fragment", "lucid", "half-remembered"],
  },
};

/**
 * Every tag the seeded user ends up owning.
 *
 * Names are already normalised (lowercase, single-spaced) so `normalizeTagName`
 * is a no-op on them — the seed asserts this rather than assuming it, because a
 * tag stored un-normalised would be invisible to the rename dialog's collision
 * check.
 *
 * Deliberately more tags than any one journal uses. The tag manager is the
 * screen most likely to look wrong at scale, and a list of six proves nothing.
 */
export const TAG_CATALOGUE = [
  "work",
  "deep work",
  "meetings",
  "incident",
  "postgres",
  "typescript",
  "code review",
  "shipped",
  "learning",
  "reading",
  "books",
  "essays",
  "health",
  "running",
  "sleep",
  "food",
  "recipes",
  "travel",
  "family",
  "friends",
  "money",
  "ideas",
  "someday",
  "gratitude",
  "morning pages",
  "evening",
  "weekend",
  "admin",
  "dreams",
  "questions",
  "wins",
  "hard day",
  "podcasts",
  "letters",
] as const;

/**
 * Tags no journal draws from, so they end up attached to nothing.
 *
 * `getAllTags` returns a `noteCount`, and the empty case is the one that gets
 * shipped broken — a tag that renders as "0 notes" and a tag that renders as
 * nothing at all look identical until someone has one. The seed asserts that
 * these really are unreferenced, since it is one edited JOURNALS entry away
 * from silently ceasing to be true.
 */
export const ORPHAN_TAGS = ["questions", "podcasts", "letters"] as const;

/**
 * Stretches, as [from, to] in days-ago, where nothing at all was written.
 *
 * Per-journal slumps are not enough on their own: with a dozen journals each
 * going quiet independently, the union still covers almost every day, and the
 * dashboard comes out with a uniformly dark heatmap and a two-year streak. These
 * are the holidays, the illnesses and the months of not keeping it up — they
 * override everything, including a journal's forced `streaks`, because a real
 * gap has to be able to break a run.
 */
export const DORMANT: [number, number][] = [
  [706, 689], // right at the start: the habit had not taken yet
  [612, 604],
  [523, 498], // the long one — nearly a month
  [401, 392],
  [332, 318],
  [259, 251],
  [166, 149],
  [98, 91],
  [43, 37],
  [23, 19], // recent, so "current streak" is a couple of weeks and not two years
];

export type JournalSpec = {
  title: string;
  description: string | null;
  topic: Topic;
  /** Probability a given eligible day gets at least one entry. */
  density: number;
  /** Local hour range entries land in, inclusive-exclusive. */
  hours: [number, number];
  /** Roughly how many body paragraphs an entry gets. */
  length: "short" | "medium" | "long";
  /** Skip Saturday and Sunday — a work journal that runs at weekends looks fake. */
  weekdaysOnly?: boolean;
  /**
   * Entries arrive in clusters rather than spread out. Trips, courses and
   * projects behave this way, and a heatmap built only from evenly-scattered
   * journals has no texture.
   */
  bursty?: boolean;
  /** Journal did not exist before this many days ago. */
  startedDaysAgo?: number;
  /** Journal stopped being written this many days ago. */
  abandonedDaysAgo?: number;
  /** Day ranges, as [from, to] in days-ago, that always get an entry. */
  streaks?: [number, number][];
  /** Lands in the trash view rather than the sidebar. */
  trash?: boolean;
  /** Tag names this journal draws from, all of which must be in TAG_CATALOGUE. */
  tags: string[];
};

/**
 * The journals themselves.
 *
 * The mix is the point. One dense daily journal alone produces a heatmap that
 * is uniformly dark and a streak that never breaks, which tells you nothing
 * about whether the streak query works. So: a weekday-only one, two that are
 * bursty, one that was abandoned in the spring, one that only started recently,
 * and two in the trash.
 */
export const JOURNALS: JournalSpec[] = [
  {
    title: "Daily Reflections",
    description: "Everyday thoughts, one entry at a time.",
    topic: "reflection",
    density: 0.72,
    hours: [6, 23],
    length: "medium",
    // A live streak ending today, and a long historic run for "longest streak"
    // to have something to find that is not the current one.
    streaks: [
      [11, 0],
      [214, 178],
    ],
    tags: ["gratitude", "evening", "weekend", "family", "friends", "sleep", "hard day", "wins"],
  },
  {
    title: "Work Log",
    description: "What I shipped, what broke, and what I learned from it.",
    topic: "work",
    density: 0.62,
    hours: [9, 20],
    length: "long",
    weekdaysOnly: true,
    tags: ["work", "deep work", "meetings", "incident", "postgres", "typescript", "code review", "shipped"],
  },
  {
    title: "Reading Notes",
    description: "Books, essays, and the ideas worth keeping.",
    topic: "reading",
    density: 0.24,
    hours: [19, 24],
    length: "long",
    tags: ["reading", "books", "essays", "learning", "evening"],
  },
  {
    title: "Running & Training",
    description: "Sessions, splits, and the parts that hurt.",
    topic: "fitness",
    density: 0.38,
    hours: [5, 9],
    length: "short",
    tags: ["running", "health", "sleep", "wins"],
  },
  {
    title: "Kitchen Notebook",
    description: "Recipes as actually cooked, not as written down.",
    topic: "cooking",
    density: 0.2,
    hours: [11, 22],
    length: "medium",
    tags: ["food", "recipes", "weekend", "family"],
  },
  {
    title: "Travel Diary",
    description: "Trips, trains, and the towns in between.",
    topic: "travel",
    density: 0.55,
    hours: [7, 23],
    length: "long",
    bursty: true,
    tags: ["travel", "friends", "food", "money"],
  },
  {
    title: "Learning Log",
    description: "Rust, Postgres, and whatever else I am failing to understand this month.",
    topic: "learning",
    density: 0.34,
    hours: [20, 24],
    length: "long",
    startedDaysAgo: 300,
    tags: ["learning", "postgres", "typescript", "deep work", "evening"],
  },
  {
    title: "Idea Parking Lot",
    description: "Things I would build if the weekend were longer.",
    topic: "ideas",
    density: 0.16,
    hours: [8, 23],
    length: "short",
    tags: ["ideas", "someday", "weekend"],
  },
  {
    title: "Gratitude",
    description: "Three things, most days.",
    topic: "gratitude",
    density: 0.46,
    hours: [21, 24],
    length: "short",
    tags: ["gratitude", "evening", "family", "friends"],
  },
  {
    title: "Dream Journal",
    description: "Written half-asleep, read back with suspicion.",
    topic: "dreams",
    // Early hours on purpose: these are the rows that made the UTC day-boundary
    // bug visible, so the seed should keep producing them.
    density: 0.14,
    hours: [3, 7],
    length: "short",
    tags: ["dreams", "sleep"],
  },
  {
    title: "Morning Pages (2025)",
    description: "Abandoned in the spring. Kept for the archaeology.",
    topic: "reflection",
    density: 0.5,
    hours: [6, 9],
    length: "medium",
    abandonedDaysAgo: 240,
    tags: ["morning pages", "gratitude", "sleep"],
  },
  {
    title: "Old Blog Drafts",
    description: "Half-written posts. Nothing here is finished.",
    topic: "ideas",
    density: 0.3,
    hours: [10, 23],
    length: "medium",
    trash: true,
    startedDaysAgo: 400,
    abandonedDaysAgo: 120,
    tags: ["ideas", "essays"],
  },
  {
    title: "Scratchpad",
    description: null,
    topic: "work",
    density: 0.35,
    hours: [9, 19],
    length: "short",
    trash: true,
    startedDaysAgo: 150,
    tags: ["work", "admin"],
  },
];
