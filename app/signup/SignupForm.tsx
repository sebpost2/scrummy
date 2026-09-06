"use client";

import { useActionState } from "react";

import { createAccount, type SignupState } from "./actions";

const initialState: SignupState = { status: "idle" };

export function SignupForm() {
  const [state, formAction, pending] = useActionState(createAccount, initialState);

  return (
    <form action={formAction} className="form">
      <label className="field">
        <span className="field__label">Name</span>
        <input type="text" name="name" placeholder="Your name" required className="input" />
      </label>
      <label className="field">
        <span className="field__label">Email</span>
        <input type="email" name="email" placeholder="you@example.com" required autoComplete="email" className="input" />
      </label>
      <label className="field">
        <span className="field__label">Password</span>
        <input
          type="password"
          name="password"
          placeholder="Password (min 8 characters)"
          required
          minLength={8}
          autoComplete="new-password"
          className="input"
        />
      </label>
      <label className="field">
        <span className="field__label">Confirm password</span>
        <input
          type="password"
          name="confirmPassword"
          placeholder="Confirm password"
          required
          minLength={8}
          autoComplete="new-password"
          className="input"
        />
      </label>
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Creating…" : "Create account"}
      </button>
      {state.status === "error" && <p className="form-error">{state.message}</p>}
    </form>
  );
}
