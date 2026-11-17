"use client";

// Shared by the waitlist and dealer forms: submit through the server action without React's automatic form
// reset (the inputs are controlled, so a fixable error keeps what was typed), then move focus to the first
// field to fix or to the error message. Without JavaScript the form still posts to the same action.
import { startTransition, useActionState, useEffect, useRef, type FormEvent } from "react";
import { INITIAL_FORM_STATE, type FormState } from "./formState";

export function useFormFlow(action: (prev: FormState, form: FormData) => Promise<FormState>) {
  const [state, dispatch, pending] = useActionState(action, INITIAL_FORM_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state.status === "invalid" && state.fields.length > 0) {
      formRef.current?.querySelector<HTMLElement>(`[data-field="${state.fields[0]}"]`)?.focus();
    } else if (state.status === "error") {
      alertRef.current?.focus();
    }
  }, [state]);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const data = new FormData(e.currentTarget);
    startTransition(() => dispatch(data));
  };

  const invalid = (field: string) => state.status === "invalid" && (state.fields as string[]).includes(field);
  return { state, dispatch, pending, formRef, alertRef, onSubmit, invalid };
}
