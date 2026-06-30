import { healthRouter } from "./health-check";
import { userRouter } from "./user-router";

export const router = {
  healthCheck: healthRouter,
  user: userRouter,
};

export type AppRouter = typeof router;
