import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function JournalHomePage() {
  await auth.protect();

  redirect("/dashboard");
}
