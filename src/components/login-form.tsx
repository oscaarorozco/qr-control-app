"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRightIcon, Lock01Icon, Mail01Icon, ShieldTickIcon } from "@untitledui/icons-react/outline";
import { toast } from "sonner";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const data = (await response.json().catch(() => null)) as
        | { role?: string; error?: string }
        | null;

      if (!response.ok) {
        const errorMessage = data?.error ?? "No se pudo iniciar sesión";
        setError(errorMessage);
        toast.error(errorMessage);
        return;
      }

      toast.success("Acceso correcto");

      if (data?.role === "admin") {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }

      router.refresh();
    } catch {
      setError("Error de red. Intenta nuevamente.");
      toast.error("Error de red. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="login-card login-form-grid" onSubmit={onSubmit}>
      <div className="login-form-head">
        <p className="login-chip">
          <ShieldTickIcon width={14} height={14} />
          Acceso privado
        </p>
        <h2 className="login-form-title">Iniciar sesion</h2>
        <p className="login-form-copy">Introduce tu correo y contrasena para continuar.</p>
      </div>

      <label className="field">
        <span>Correo electrónico</span>
        <div className="input-with-icon">
          <Mail01Icon width={16} height={16} />
          <input
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={120}
            autoComplete="email"
            placeholder="persona@dominio.com"
          />
        </div>
      </label>

      <label className="field">
        <span>Contraseña</span>
        <div className="input-with-icon">
          <Lock01Icon width={16} height={16} />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            maxLength={128}
            autoComplete="current-password"
          />
        </div>
      </label>

      {error ? (
        <p className="error login-error">
          {error}. Si persiste, recarga la pagina con Ctrl+F5 e intenta de nuevo.
        </p>
      ) : null}

      <button className="btn-primary" disabled={loading}>
        <span className="btn-inline">
          {loading ? "Entrando..." : "Iniciar sesion"}
          <ArrowRightIcon width={16} height={16} />
        </span>
      </button>

      <p className="login-note">Si olvidaste tus datos, solicita al administrador un enlace seguro de restablecimiento.</p>
    </form>
  );
}
