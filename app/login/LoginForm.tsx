"use client";

import { useActionState } from "react";

import { login, type LoginState } from "./actions";

const initialState: LoginState = { status: "idle" };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="form">
      <label className="field">
        <span className="field__label">Email</span>
        <input type="email" name="email" placeholder="you@example.com" required autoComplete="email" className="input" />
      </label>
      <label className="field">
        <span className="field__label">Password</span>
        <input
          type="password"
          name="password"
          placeholder="Password"
          required
          autoComplete="current-password"
          className="input"
        />
      </label>
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </button>
      {state.status === "error" && <p className="form-error">{state.message}</p>}
    </form>
  );
}
