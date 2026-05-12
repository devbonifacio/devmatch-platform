import { AuthLayout, Field, ErrorBanner, Spinner } from "../components/Ui";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

export default function Login() {
  const navigate = useNavigate();
  const { login, loading } = useAuthStore();

  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const result = await login(form.email, form.password);
    if (!result.success) {
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

        <button
          type="submit"
          className="btn-primary w-full py-3"
          disabled={loading || !form.email || !form.password}
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