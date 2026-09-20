import { useState, type FormEvent } from "react";

export function AccountForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (
    kind: "signin" | "signup",
    fields: { name: string; email: string; password: string },
  ) => Promise<void>;
}) {
  const [kind, setKind] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    const submitted = { name: name.trim(), email: email.trim(), password };
    setPassword("");
    await onSubmit(kind, submitted);
  }
  return (
    <section className="account-panel" aria-labelledby="account-heading">
      <div className="account-intro">
        <div className="eyebrow">YOUR MUSIC, IN ONE PLACE</div>
        <h2 id="account-heading">
          {kind === "signin" ? "Welcome back" : "Start your library"}
        </h2>
        <p>
          Keep your lead sheets and tutorial links together. Sign in to find
          your saved work on another device.
        </p>
        <p className="small">
          Accounts are stored on the backend you are connected to. Password
          reset and email verification are not available in this local
          development version.
        </p>
      </div>
      <form
        onSubmit={(event) => void submit(event)}
        aria-label={kind === "signin" ? "Sign in" : "Create account"}
      >
        <div className="segmented" aria-label="Account action">
          <button
            type="button"
            disabled={busy}
            aria-pressed={kind === "signin"}
            onClick={() => {
              setKind("signin");
              setPassword("");
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            disabled={busy}
            aria-pressed={kind === "signup"}
            onClick={() => {
              setKind("signup");
              setPassword("");
            }}
          >
            Create account
          </button>
        </div>
        {kind === "signup" && (
          <label className="field">
            Name
            <input
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={100}
              disabled={busy}
            />
          </label>
        )}
        <label className="field">
          Email
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            maxLength={254}
            disabled={busy}
          />
        </label>
        <label className="field">
          Password
          <input
            type="password"
            autoComplete={
              kind === "signup" ? "new-password" : "current-password"
            }
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={12}
            maxLength={128}
            disabled={busy}
            aria-describedby="password-hint"
          />
        </label>
        <p id="password-hint" className="small">
          Use 12–128 characters.
        </p>
        <button className="primary" disabled={busy} type="submit">
          {busy
            ? "Please wait…"
            : kind === "signin"
              ? "Sign in to your library"
              : "Create your account"}
        </button>
      </form>
    </section>
  );
}
