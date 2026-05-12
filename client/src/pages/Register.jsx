import { AuthLayout, Field, ErrorBanner, Spinner } from "../components/Ui";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

export default function Register() {
  const navigate = useNavigate();
  const { register, loading } = useAuthStore();

  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const result = await register(form);
    if (!result.success) {
      setError(result.message);
      return;
    }
    navigate("/profile");
  };

  return (
    <AuthLayout
      title="Cria a tua conta"
      subtitle="Começa a colaborar com devs de todo o mundo."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Nome">
          <input
            type="text"
            placeholder="O teu nome"
            className="input-field"
            value={form.name}
            autoComplete="name"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>

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
            placeholder="Mínimo 6 caracteres"
            className="input-field"
            value={form.password}
            autoComplete="new-password"
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>

        {error && <ErrorBanner message={error} />}

        <button
          type="submit"
          className="btn-primary w-full py-3"
          disabled={loading || !form.name || !form.email || !form.password}
        >
          {loading ? <Spinner /> : "Criar conta"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        Já tens conta?{" "}
        <Link to="/login" className="font-medium text-brand-400 transition-colors hover:text-brand-300">
          Entrar →
        </Link>
      </p>
    </AuthLayout>
  );
}