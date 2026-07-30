import { journalRouter } from "./main-journal";
import { notesRouter } from "./note";
import { searchRouter } from "./search";
import { statsRouter } from "./stats";
import { tagRouter } from "./tag";

export const router = {
  journalRouter,
  notesRouter,
  searchRouter,
  statsRouter,
  tagRouter,
};

export type AppRouter = typeof router;
