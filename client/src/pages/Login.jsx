import { AuthLayout, Field, ErrorBanner, Spinner } from "../components/Ui";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

export default function Login() {
  const navigate = useNavigate();
  const { login, loading } = useAuthStore();

  const [form, setForm] = useState({ email: "", password: "" });
  const [honeypot, setHoneypot] = useState("");
  const [error, setError] = useState("");
  const [rateLimited, setRateLimited] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setRateLimited(false);
    if (honeypot) return; // silent bot block
    const result = await login(form.email, form.password);
    if (!result.success) {
      if (result.status === 429) setRateLimited(true);
      setError(result.message);
      return;
    }
    navigate("/discover");
  };

  return (
    <AuthLayout
      title="Bem-vindo de volta"
      subtitle="Continua a encontrar devs incríveis."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Honeypot — hidden from real users, bots fill it */}
        <input
          type="text"
          name="website"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          autoComplete="off"
          tabIndex={-1}
          aria-hidden="true"
          style={{ position: "absolute", left: "-9999px", opacity: 0, height: 0 }}
        />

        <Field label="Email">
          <input
            type="email"
            placeholder="tu@exemplo.com"
            className="input-field"
            value={form.email}
            autoComplete="email"
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>

        <Field label="Palavra-passe">
          <input
            type="password"
            placeholder="••••••••"
            className="input-field"
            value={form.password}
            autoComplete="current-password"
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>

        {error && <ErrorBanner message={error} />}

        {rateLimited && (
          <p className="text-xs text-amber-400 text-center">
            Conta temporariamente bloqueada por demasiadas tentativas. Tenta novamente em 15 minutos.
          </p>
        )}

        <button
          type="submit"
          className="btn-primary w-full py-3"
          disabled={loading || !form.email || !form.password || rateLimited}
        >
          {loading ? <Spinner /> : "Entrar"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        Ainda não tens conta?{" "}
        <Link to="/register" className="font-medium text-brand-400 transition-colors hover:text-brand-300">
          Criar conta →
        </Link>
      </p>
    </AuthLayout>
  );
}