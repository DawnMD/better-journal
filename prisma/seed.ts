import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

/**
 * Seeds a realistic multi-month dataset, and normalizes legacy note content.
 *
 *   pnpm db:seed                       # seed for SEED_USER_ID
 *   pnpm db:seed -- --user user_123     # seed for a specific Clerk user
 *   pnpm db:seed -- --normalize         # only repair legacy content, no new rows
 *   pnpm db:seed -- --reset             # delete this user's journals first
 *
 * Multi-month on purpose: the dashboard (streaks, heatmap, word counts) and
 * full-text search are all impossible to evaluate against an empty database, and
 * a single day of data makes a streak chart look broken rather than empty.
 */

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const args = process.argv.slice(2);
const hasFlag = (flag: string) => args.includes(flag);
const flagValue = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const EMPTY_DOC = [{ type: "p", children: [{ text: "" }] }];

/** Sentence pool, deliberately varied so ts_rank and mood extraction have signal. */
const OPENERS = [
  "Woke up before the alarm and actually felt rested for once.",
  "Long day. The kind where the hours blur together and nothing sticks.",
  "Spent the morning reading on the balcony while it was still cool.",
  "Deployment went out at 3pm and nothing caught fire, which felt suspicious.",
  "Rain all afternoon, so I stayed in and finally cleared the reading pile.",
  "Coffee with Priya — first time in months we both had a free evening.",
  "Ran six kilometres and regretted roughly the last two of them.",
  "Stuck on the same bug since yesterday. Stepping away helped more than staring.",
  "Cooked properly for the first time this week instead of ordering in.",
  "Quiet day. Nothing much happened and that was the best part of it.",
];

const MIDDLES = [
  "Been thinking about how much of the work is just deciding what not to build.",
  "The tricky part was never the code, it was agreeing on what correct meant.",
  "Noticed I get more done in ninety focused minutes than in a whole scattered day.",
  "Trying to be more deliberate about when I pick up my phone in the morning.",
  "There is something clarifying about writing a thing down before reacting to it.",
  "Realised I have been putting off the one task that would unblock three others.",
  "Small wins today, but they compounded in a way that felt genuinely good.",
  "Reminded myself that tired is not the same as stuck, and they need different fixes.",
];

const CLOSERS = [
  "Tomorrow: finish the migration, then actually stop at a reasonable hour.",
  "Going to bed early. Genuinely, this time.",
  "Grateful for a slow evening and nothing urgent in the inbox.",
  "Want to keep this rhythm going for the rest of the week.",
  "Note to self: ask for help sooner next time.",
];

const JOURNALS = [
  {
    title: "Daily Reflections",
    description: "Everyday thoughts, one entry at a time.",
    density: 0.75,
  },
  {
    title: "Work Log",
    description: "What I shipped, what broke, and what I learned from it.",
    density: 0.45,
  },
  {
    title: "Reading Notes",
    description: "Books, essays, and the ideas worth keeping.",
    density: 0.2,
  },
];

/** Deterministic PRNG so reruns produce the same dataset — diffable screenshots. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const random = makeRandom(20260730);

const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)];

function paragraph(text: string) {
  return { type: "p", children: [{ text }] };
}

function buildEntry() {
  const blocks: Record<string, unknown>[] = [paragraph(pick(OPENERS))];

  const extra = Math.floor(random() * 3);
  for (let i = 0; i < extra; i++) {
    blocks.push(paragraph(pick(MIDDLES)));
  }

  if (random() > 0.4) {
    blocks.push({
      type: "blockquote",
      children: [{ text: pick(CLOSERS) }],
    });
  }

  return blocks;
}

async function normalizeLegacyContent() {
  // Rows written before createNote produced a real Plate document. Prisma cannot
  // express "content is a JSON string" in a typed where clause, so this reads the
  // candidates and filters in JS — fine for a one-off maintenance script.
  const notes = await db.note.findMany({ select: { id: true, content: true } });

  const broken = notes.filter(
    (note) => !Array.isArray(note.content) || note.content.length === 0,
  );

  if (broken.length === 0) {
    console.log("[seed] no legacy content rows to normalize");
    return;
  }

  for (const note of broken) {
    await db.note.update({
      where: { id: note.id },
      data: { content: EMPTY_DOC },
    });
  }

  console.log(`[seed] normalized ${broken.length} legacy content row(s)`);
}

async function seedForUser(userId: string, reset: boolean) {
  if (reset) {
    const { count } = await db.journal.deleteMany({ where: { userId } });
    console.log(`[seed] deleted ${count} existing journal(s) for ${userId}`);
  }

  const today = new Date();
  const DAYS = 180;
  let totalNotes = 0;

  for (const spec of JOURNALS) {
    const journal = await db.journal.create({
      data: {
        title: spec.title,
        description: spec.description,
        userId,
      },
    });

    const notes: {
      journalId: string;
      title: string;
      content: unknown;
      createdAt: Date;
      updatedAt: Date;
    }[] = [];

    for (let daysAgo = DAYS; daysAgo >= 0; daysAgo--) {
      // A gap every so often, so streaks are interesting rather than a flat line.
      const inSlump = daysAgo % 37 < 5;
      if (inSlump || random() > spec.density) continue;

      const perDay = random() > 0.85 ? 2 : 1;

      for (let n = 0; n < perDay; n++) {
        const createdAt = new Date(today);
        createdAt.setDate(createdAt.getDate() - daysAgo);
        // Spread across the day, including the early hours that made the
        // timezone bug visible.
        createdAt.setHours(
          Math.floor(random() * 24),
          Math.floor(random() * 60),
          0,
          0,
        );

        notes.push({
          journalId: journal.id,
          title: createdAt.toLocaleString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }),
          content: buildEntry(),
          createdAt,
          updatedAt: createdAt,
        });
      }
    }

    await db.note.createMany({ data: notes as never });
    totalNotes += notes.length;
    console.log(`[seed] ${spec.title}: ${notes.length} notes`);
  }

  console.log(`[seed] done — 3 journals, ${totalNotes} notes for ${userId}`);
}

async function main() {
  if (hasFlag("--normalize")) {
    await normalizeLegacyContent();
    return;
  }

  const userId = flagValue("--user") ?? process.env.SEED_USER_ID;

  if (!userId) {
    console.error(
      [
        "No user id. Notes hang off a Clerk user id, so the seed needs to know",
        "whose journals these are. Pass one or set SEED_USER_ID:",
        "",
        "  pnpm db:seed -- --user user_2abc...",
        "",
        "Find yours in the Clerk dashboard, or log `userId` from server/context.ts.",
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  await seedForUser(userId, hasFlag("--reset"));
  await normalizeLegacyContent();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
