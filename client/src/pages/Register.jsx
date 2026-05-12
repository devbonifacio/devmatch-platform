import { AuthLayout, Field, ErrorBanner, Spinner } from "../components/Ui";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

export default function Register() {
  const navigate = useNavigate();
  const { register, loading } = useAuthStore();

  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [honeypot, setHoneypot] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (honeypot) return; // silent bot block
    if (form.password !== form.confirmPassword) {
      setError("As palavras-passe não coincidem.");
      return;
    }
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
            placeholder="Mín. 8 chars, maiúscula, minúscula e número"
            className="input-field"
            value={form.password}
            autoComplete="new-password"
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>

        <Field label="Confirmar palavra-passe">
          <input
            type="password"
            placeholder="Repete a palavra-passe"
            className="input-field"
            value={form.confirmPassword}
            autoComplete="new-password"
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
          />
          {form.confirmPassword && form.password !== form.confirmPassword && (
            <p className="mt-1 text-xs text-red-400">As palavras-passe não coincidem.</p>
          )}
        </Field>

        {error && <ErrorBanner message={error} />}

        <button
          type="submit"
          className="btn-primary w-full py-3"
          disabled={
            loading ||
            !form.name ||
            !form.email ||
            !form.password ||
            !form.confirmPassword ||
            form.password !== form.confirmPassword
          }
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