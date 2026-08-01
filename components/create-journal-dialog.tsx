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
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupTextarea } from "@/components/ui/input-group";
import { orpc } from "@/lib/orpc.query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const formSchema = z.object({
  title: z
    .string()
    .min(5, "Journal title must be at least 5 characters.")
    .max(32, "Journal title must be at most 32 characters."),
  description: z.string().optional(),
});

/**
 * Create a journal.
 *
 * Fully controlled, with no trigger of its own. It used to render its own
 * `SidebarMenuItem` trigger, which tied the one form for creating a journal to
 * the sidebar primitive — so when the sidebar went, this had to come with it or
 * be rebuilt. Now every entry point (the journal switcher, the empty state)
 * renders whatever button suits it and drives `open` from the outside.
 *
 * The form itself — schema, resolver, fields, invalidation — is unchanged.
 */
export const CreateJournalDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const queryClient = useQueryClient();
  const router = useRouter();

  const { mutate, isPending } = useMutation(
    orpc.journalRouter.createJournal.mutationOptions({
      // `createJournal` outputs the new id as a bare string.
      onSuccess: (journalId) => {
        form.reset();
        queryClient.invalidateQueries({
          queryKey: orpc.journalRouter.getAllJournal.queryKey(),
        });
        toast.success("Journal created successfully");
        onOpenChange(false);
        // Straight into the new journal. Without a sidebar list there is no
        // longer a place where a newly created journal simply appears, so
        // creating one has to take you there.
        router.push(`/journal/${journalId}`);
      },
      onError: () => {
        toast.error("Failed to create journal");
      },
    }),
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
    },
  });

  function onSubmit(data: z.infer<typeof formSchema>) {
    mutate({
      title: data.title,
      description: data.description,
    });
  }

  return (
    <Dialog
      disablePointerDismissal={isPending}
      open={open}
      onOpenChange={(state) => {
        onOpenChange(state);
        form.reset();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl font-medium">
            Start a new journal
          </DialogTitle>
          <DialogDescription>
            Give it a name and, if you like, a line about what it is for.
          </DialogDescription>
        </DialogHeader>
        <form
          id="create-new-journal"
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Controller
              name="title"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="journal-title">Journal Title</FieldLabel>
                  <Input
                    {...field}
                    id="journal-title"
                    aria-invalid={fieldState.invalid}
                    autoComplete="off"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="description"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="journal-description">
                    Description
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupTextarea
                      {...field}
                      id="journal-description"
                      rows={6}
                      className="min-h-24 resize-none"
                      aria-invalid={fieldState.invalid}
                    />
                  </InputGroup>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>
          <DialogFooter>
            <DialogClose
              onClick={() => form.reset()}
              render={
                <Button variant="outline" disabled={isPending}>
                  Cancel
                </Button>
              }
            />
            <Button type="submit" disabled={isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
