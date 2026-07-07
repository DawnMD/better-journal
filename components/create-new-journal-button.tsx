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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupTextarea } from "@/components/ui/input-group";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { orpc } from "@/lib/orpc.query";
import { getQueryClient } from "@/lib/query/get-query-client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";

const formSchema = z.object({
  title: z
    .string()
    .min(5, "Journal title must be at least 5 characters.")
    .max(32, "Journal title must be at most 32 characters."),
  description: z.string().optional(),
});

export const CreateNewJOurnalButton = () => {
  const queryClient = getQueryClient();
  const [open, setOpen] = useState(false);
  const { setOpenMobile } = useSidebar();

  const { mutate, isPending } = useMutation(
    orpc.journalRouter.createJournal.mutationOptions({
      onSuccess: () => {
        form.reset();
        queryClient.invalidateQueries({
          queryKey: orpc.journalRouter.getAllJournal.queryKey(),
        });
        setOpenMobile(false);
        toast.success("Journal created successfully");
        setOpen(false);
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
    <>
      <Dialog
        disablePointerDismissal={isPending}
        open={open}
        onOpenChange={(state) => {
          setOpen(state);
          form.reset();
        }}
      >
        <DialogTrigger
          nativeButton={false}
          render={
            <SidebarMenuItem>
              <SidebarMenuButton tooltip={"Create Journal"}>
                <PlusIcon />
                <span>Create journal</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          }
        />
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create new journal</DialogTitle>
            <DialogDescription>
              Create new journal for your new journey. Click save when
              you&apos;re done.
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
                    <FieldLabel htmlFor="journal-title">
                      Journal Title
                    </FieldLabel>
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
              {/* <Controller
                name="hidden"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field
                    orientation="horizontal"
                    data-invalid={fieldState.invalid}
                  >
                    <FieldContent>
                      <FieldLabel htmlFor="journal-hidden-mode">
                        Hidden journal
                      </FieldLabel>
                      <FieldDescription>
                        Hide journal on creation
                      </FieldDescription>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </FieldContent>
                    <Switch
                      id="journal-hidden-mode"
                      name={field.name}
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      aria-invalid={fieldState.invalid}
                    />
                  </Field>
                )}
              /> */}
              {/* <Controller
                name="passwordProtected"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field
                    orientation="horizontal"
                    data-invalid={fieldState.invalid}
                  >
                    <FieldContent>
                      <FieldLabel htmlFor="journal-password-mode">
                        Protect with Passord
                      </FieldLabel>
                    </FieldContent>
                    <Switch
                      id="journal-password-mode"
                      name={field.name}
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      aria-invalid={fieldState.invalid}
                    />
                  </Field>
                )}
              /> */}
              {/* {passwordProtected && (
                <>
                  <Controller
                    name="password"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="journal-password">
                          Journal Passord
                        </FieldLabel>
                        <Input
                          {...field}
                          id="journal-password"
                          aria-invalid={fieldState.invalid}
                          autoComplete="off"
                          type="password"
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                  <Controller
                    name="confirmPassword"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="confirm-journal-password">
                          Confirm journal Passord
                        </FieldLabel>
                        <Input
                          {...field}
                          id="confirm-journal-password"
                          aria-invalid={fieldState.invalid}
                          autoComplete="off"
                          type="password"
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                </>
              )} */}
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
    </>
  );
};
