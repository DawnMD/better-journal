import { z } from "zod";
import { publicProcedure } from "../orpc";

export const healthRouter = {
  check: publicProcedure.input(z.void()).handler(() => {
    return "OK";
  }),
};
