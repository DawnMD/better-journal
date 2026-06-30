import { z } from "zod";
import { protectedProcedure } from "../orpc";

export const userRouter = {
  me: protectedProcedure.input(z.void()).handler(({ context }) => {
    return context.userId;
  }),
  post: protectedProcedure.input(z.void()).handler(async ({ context }) => {
    return await context.db.post.count();
  }),
};
