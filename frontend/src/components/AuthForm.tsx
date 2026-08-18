import { useState } from "react";
import * as authApi from "../api/auth";
import { ApiError } from "../api/client";
import type { Role, Session } from "../types";

interface AuthFormProps {
  role: Role;
  accent: "rider" | "driver" | "admin";
  onAuthenticated: (session: Session) => void;
}

const DEFAULT_EMAIL: Record<Role, string> = {
  RIDER: "rider1@test.com",
  DRIVER: "driver1@test.com",
  ADMIN: "admin1@test.com",
};

export default function AuthForm({ role, accent, onAuthenticated }: AuthFormProps) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState(DEFAULT_EMAIL[role]);
  const [password, setPassword] = useState("Passw0rd!");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const ring = accent === "rider" ? "focus:ring-blue-400" : accent === "driver" ? "focus:ring-brand-400" : "focus:ring-slate-400";
  const btn = accent === "rider" ? "bg-blue-600 hover:bg-blue-700" : accent === "driver" ? "bg-brand-500 hover:bg-brand-600" : "bg-slate-700 hover:bg-slate-800";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "register") {
        await authApi.register(email, password, role);
      }
      const { token } = await authApi.login(email, password);
      onAuthenticated({ email, role, token });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col gap-3">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        required
        className={`rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 ${ring}`}
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        required
        className={`rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 ${ring}`}
      />
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className={`rounded-xl px-3 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${btn}`}
      >
        {loading ? "Please wait…" : mode === "register" ? "Create account & continue" : "Log in"}
      </button>
      <button
        type="button"
        onClick={() => setMode(mode === "register" ? "login" : "register")}
        className="text-xs font-medium text-gray-500 hover:text-gray-700"
      >
        {mode === "register" ? "Already have an account? Log in" : "New here? Register instead"}
      </button>
    </form>
  );
}
