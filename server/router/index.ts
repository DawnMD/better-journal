import { journalRouter } from "./main-journal";
import { notesRouter } from "./note";
import { tagRouter } from "./tag";

export const router = {
  journalRouter,
  notesRouter,
  tagRouter,
};

export type AppRouter = typeof router;
