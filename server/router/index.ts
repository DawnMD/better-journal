import { journalRouter } from "./main-journal";
import { notesRouter } from "./note";

export const router = {
  journalRouter,
  notesRouter,
};

export type AppRouter = typeof router;
