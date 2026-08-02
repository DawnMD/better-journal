import { exportRouter } from "./export";
import { journalRouter } from "./main-journal";
import { notesRouter } from "./note";
import { searchRouter } from "./search";
import { shareRouter } from "./share";
import { statsRouter } from "./stats";
import { tagRouter } from "./tag";

export const router = {
  exportRouter,
  journalRouter,
  notesRouter,
  searchRouter,
  shareRouter,
  statsRouter,
  tagRouter,
};

export type AppRouter = typeof router;
