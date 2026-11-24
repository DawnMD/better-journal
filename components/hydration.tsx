import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from "@tanstack/react-query";
import { connection } from "next/server";

/**
 * Hands the server's prefetched queries to the client cache.
 *
 * Waits for `connection()` first: `dehydrate` stamps each query with
 * `Date.now()`, and Cache Components only allows reading the clock at request
 * time. The data it carries is per-reader anyway, so it never belongs in a
 * prerender.
 */
export async function HydrateClient(props: {
  children: React.ReactNode;
  client: QueryClient;
}) {
  await connection();

  return (
    <HydrationBoundary state={dehydrate(props.client)}>
      {props.children}
    </HydrationBoundary>
  );
}
