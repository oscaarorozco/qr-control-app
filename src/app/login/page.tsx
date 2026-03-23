import { redirect } from "next/navigation";
import { QrCode01Icon, ShieldTickIcon, ZapFastIcon } from "@untitledui/icons-react/outline";
import { LoginForm } from "@/components/login-form";
import { getSessionFromCookies } from "@/lib/auth";

export const runtime = "nodejs";

export default async function LoginPage() {
  const session = await getSessionFromCookies();

  if (session?.role === "admin") {
    redirect("/admin");
  }

  if (session?.role === "user") {
    redirect("/dashboard");
  }

  return (
    <main className="login-screen login-shell">
      <div className="login-layout">
        <section className="login-brand-panel">
          <p className="login-eyebrow">Sistema de Control</p>
          <h1 className="login-brand-title">
            Acceso rapido, seguro y elegante para tu control QR
          </h1>
          <p className="login-brand-copy">
            Gestiona entradas en segundos, con una interfaz limpia y preparada para moviles.
          </p>

          <div className="login-brand-features" aria-hidden="true">
            <article className="login-feature-chip">
              <ShieldTickIcon width={16} height={16} />
              Sesion segura
            </article>
            <article className="login-feature-chip">
              <ZapFastIcon width={16} height={16} />
              Flujo instantaneo
            </article>
            <article className="login-feature-chip">
              <QrCode01Icon width={16} height={16} />
              Listo para escaneo
            </article>
          </div>
        </section>

        <section className="login-form-panel" aria-label="Formulario de acceso">
          <LoginForm />
        </section>
      </div>
    </main>
  );
}
