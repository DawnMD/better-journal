import { RPCHandler } from "@orpc/server/fetch";
import { onError } from "@orpc/server";
import { auth } from "@clerk/nextjs/server";
import { createContext } from "@/server/context";
import { router } from "@/server/router";

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

async function handleRequest(request: Request) {
  // No anonymous HTTP entrance to the router: a signed-out request gets a 404
  // before any procedure runs. The one public procedure, the shared note, is
  // reached by the share page on the server, not through here.
  await auth.protect();

  const { response } = await handler.handle(request, {
    prefix: "/rpc",
    context: await createContext(),
  });

  return response ?? new Response("Not found", { status: 404 });
}

export const HEAD = handleRequest;
export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
