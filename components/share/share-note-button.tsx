"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { orpc } from "@/lib/orpc.query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CopyIcon, Share2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Publishes one entry to a link, and takes it back.
 *
 * Lives on the note itself rather than in the row menu because sharing is a
 * decision about *this* piece of writing, made while looking at it — and because
 * the state it reports ("shared" vs "not shared") is worth seeing next to the
 * entry it applies to.
 *
 * The link state is fetched only when the dialog opens. Every note in the app is
 * unshared until someone says otherwise, so asking on every note load would be a
 * round trip per entry to answer "no" — the query below is `enabled: open` for
 * exactly that reason.
 */
export function ShareNoteButton({ noteId }: { noteId: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const linkKey = orpc.shareRouter.getShareLink.queryKey({ input: { noteId } });

  const { data: share, isLoading } = useQuery({
    ...orpc.shareRouter.getShareLink.queryOptions({ input: { noteId } }),
    enabled: open,
  });

  const { mutate: createLink, isPending: isCreating } = useMutation(
    orpc.shareRouter.createShareLink.mutationOptions({
      onSuccess: (created) => queryClient.setQueryData(linkKey, created),
      onError: (error) => toast.error(error.message),
    }),
  );

  const { mutate: revokeLink, isPending: isRevoking } = useMutation(
    orpc.shareRouter.revokeShareLink.mutationOptions({
      onSuccess: () => {
        queryClient.setQueryData(linkKey, null);
        toast.success("Link turned off", {
          description: "Anyone holding it now gets a dead end.",
        });
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  // Composed in the browser rather than returned by the server, which would have
  // to be told its own public origin to do it — an env var that is wrong in every
  // preview deployment. `window.location.origin` is right by construction.
  const shareUrl =
    share && typeof window !== "undefined"
      ? `${window.location.origin}/share/${share.token}`
      : "";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied");
    } catch {
      // Denied permission, or an insecure origin. The link is on screen and
      // selectable, so this is a nudge rather than a failure.
      toast.error("Couldn't copy", {
        description: "Select the link above and copy it manually.",
      });
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto h-6 gap-1.5 px-1.5 text-[11px] font-normal tracking-[0.16em] text-muted-foreground uppercase hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        <Share2Icon className="size-3" />
        Share
      </Button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        disablePointerDismissal={isCreating || isRevoking}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share this entry</DialogTitle>
            <DialogDescription>
              {/* Said plainly, and before the link exists. A share link has no
                  password and no expiry, and someone deciding whether to send one
                  should know that at the moment they decide — not afterwards. */}
              Anyone with the link can read this entry — no account needed. They
              see the entry only, not your journal, and they always see the
              latest version. Turn the link off at any time.
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Checking…</p>
          ) : share ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={shareUrl}
                  aria-label="Share link"
                  // Selects the whole URL on focus, so keyboard copying is one
                  // chord rather than a drag across a 60-character string.
                  onFocus={(event) => event.currentTarget.select()}
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyLink}
                  aria-label="Copy share link"
                >
                  <CopyIcon />
                  Copy
                </Button>
              </div>
              <DialogFooter>
                <DialogClose render={<Button variant="ghost">Done</Button>} />
                <Button
                  variant="destructive"
                  disabled={isRevoking}
                  onClick={() => revokeLink({ noteId })}
                >
                  Turn off link
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <DialogFooter>
              <DialogClose
                render={<Button variant="outline">Cancel</Button>}
              />
              <Button
                disabled={isCreating}
                onClick={() => createLink({ noteId })}
              >
                Create link
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
