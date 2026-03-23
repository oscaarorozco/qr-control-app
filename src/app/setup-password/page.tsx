import { QrCode01Icon, ShieldTickIcon, ZapFastIcon } from "@untitledui/icons-react/outline";
import { PasswordSetupForm } from "@/components/password-setup-form";

export const runtime = "nodejs";

type SetupPasswordPageProps = {
  searchParams?: Promise<{ token?: string }>;
};

export default async function SetupPasswordPage({ searchParams }: SetupPasswordPageProps) {
  const params = (await searchParams) ?? {};
  const token = typeof params.token === "string" ? params.token : "";

  return (
    <main className="login-screen login-shell">
      <div className="login-layout">
        <section className="login-brand-panel">
          <p className="login-eyebrow">Sistema de Control</p>
          <h1 className="login-brand-title">Activa tu acceso de forma segura</h1>
          <p className="login-brand-copy">
            Crea tu contrasena desde un enlace de un solo uso y protege tu cuenta desde el primer inicio.
          </p>

          <div className="login-brand-features" aria-hidden="true">
            <article className="login-feature-chip">
              <ShieldTickIcon width={16} height={16} />
              Enlace unico
            </article>
            <article className="login-feature-chip">
              <ZapFastIcon width={16} height={16} />
              Activacion rapida
            </article>
            <article className="login-feature-chip">
              <QrCode01Icon width={16} height={16} />
              Acceso inmediato
            </article>
          </div>
        </section>

        <section className="login-form-panel" aria-label="Formulario para configurar contrasena">
          <PasswordSetupForm initialToken={token} />
        </section>
      </div>
    </main>
  );
}
