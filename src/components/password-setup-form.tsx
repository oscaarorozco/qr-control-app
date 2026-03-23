"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { ArrowRightIcon, Key01Icon, Lock01Icon, ShieldTickIcon } from "@untitledui/icons-react/outline";
import { toast } from "sonner";

type PasswordSetupFormProps = {
  initialToken: string;
};

function isStrongPassword(password: string) {
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  return password.length >= 10 && hasUpper && hasLower && hasNumber;
}

export function PasswordSetupForm({ initialToken }: PasswordSetupFormProps) {
  const router = useRouter();
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const passwordValid = useMemo(() => isStrongPassword(password), [password]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (token.trim().length < 20) {
      setError("El enlace no es valido o esta incompleto");
      return;
    }

    if (!passwordValid) {
      setError("La contrasena debe tener al menos 10 caracteres, mayuscula, minuscula y numero");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contrasenas no coinciden");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/password-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          token: token.trim(),
          password,
        }),
      });

      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

      if (!response.ok || !data?.ok) {
        const errorMessage = data?.error ?? "No se pudo definir la contrasena";
        setError(errorMessage);
        toast.error(errorMessage);
        return;
      }

      toast.success("Contrasena configurada correctamente");
      router.push("/login");
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
          Configuracion segura
        </p>
        <h2 className="login-form-title">Define tu contrasena</h2>
        <p className="login-form-copy">Este enlace es de un solo uso. Crea una clave segura para activar tu cuenta.</p>
      </div>

      <label className="field">
        <span>Token de acceso</span>
        <div className="input-with-icon">
          <Key01Icon width={16} height={16} />
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            required
            minLength={20}
            maxLength={256}
            autoComplete="off"
          />
        </div>
      </label>

      <label className="field">
        <span>Nueva contrasena</span>
        <div className="input-with-icon">
          <Lock01Icon width={16} height={16} />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={10}
            maxLength={128}
            autoComplete="new-password"
          />
        </div>
      </label>

      <label className="field">
        <span>Repite la contrasena</span>
        <div className="input-with-icon">
          <Lock01Icon width={16} height={16} />
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            minLength={10}
            maxLength={128}
            autoComplete="new-password"
          />
        </div>
      </label>

      {error ? <p className="error login-error">{error}</p> : null}

      <button className="btn-primary" disabled={loading}>
        <span className="btn-inline">
          {loading ? "Guardando..." : "Guardar contrasena"}
          <ArrowRightIcon width={16} height={16} />
        </span>
      </button>

      <p className="login-note">
        Ya tienes acceso? <Link href="/login">Volver al inicio de sesion</Link>
      </p>
    </form>
  );
}
