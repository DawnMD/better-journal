import { aiRouter } from "./ai";
import { exportRouter } from "./export";
import { journalRouter } from "./main-journal";
import { notesRouter } from "./note";
import { searchRouter } from "./search";
import { statsRouter } from "./stats";
import { tagRouter } from "./tag";

export const router = {
  aiRouter,
  exportRouter,
  journalRouter,
  notesRouter,
  searchRouter,
  statsRouter,
  tagRouter,
};

export type AppRouter = typeof router;
