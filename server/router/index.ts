import { journalRouter } from "./main-journal";
import { notesRouter } from "./note";
import { searchRouter } from "./search";
import { tagRouter } from "./tag";

export const router = {
  journalRouter,
  notesRouter,
  searchRouter,
  tagRouter,
};

export type AppRouter = typeof router;
