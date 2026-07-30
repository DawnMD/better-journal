import "./load-env";
import { afterAll, beforeEach } from "vitest";
import { resetDb, testDb } from "./helpers/db";

// A clean database before each test, so cases cannot depend on each other's
// leftovers or on execution order.
beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testDb.$disconnect();
});
