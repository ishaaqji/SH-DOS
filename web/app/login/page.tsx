"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";

  const [email, setEmail] = useState("owner@shdos.test");
  const [password, setPassword] = useState("password");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "Login failed");
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("Could not reach the server. Is the backend running?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <Card className="auth-card">
        <CardBody>
          <div className="auth-brand">
            <span className="auth-logo">S</span>
            <div>
              <div className="sidebar-brand-name">SH-DOS</div>
              <div className="sidebar-brand-sub">Control Center</div>
            </div>
          </div>
          <h1 className="auth-title">Sign in</h1>
          <p className="auth-subtitle">Access the Star Hindis Digital Operating System.</p>

          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={submit}>
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Password" htmlFor="password" hint="Demo credentials are pre-filled.">
              <Input
                id="password"
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Button type="submit" block size="lg" loading={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <hr className="divider" />
          <p className="text-xs text-faint" style={{ textAlign: "center" }}>
            Demo users: owner@shdos.test · editor@shdos.test · author@shdos.test
            <br />
            Password for all demo users: <span className="kbd">password</span>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
