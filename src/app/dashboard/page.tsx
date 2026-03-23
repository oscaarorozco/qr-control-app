import Image from "next/image";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import {
  Mail01Icon,
  MessageChatCircleIcon,
  QrCode01Icon,
  Download01Icon,
  Ticket01Icon,
} from "@untitledui/icons-react/outline";
import { LogoutButton } from "@/components/logout-button";
import { getSessionFromCookies } from "@/lib/auth";
import { getUserById } from "@/lib/db";

export const runtime = "nodejs";

export default async function DashboardPage() {
  const session = await getSessionFromCookies();

  if (!session) {
    redirect("/login");
  }

  if (session.role === "admin") {
    redirect("/admin");
  }

  const user = getUserById(session.userId);

  if (!user) {
    redirect("/login");
  }

  const qrValue = `QRCAPP:${user.qrToken}`;
  const qrDataUrl = await QRCode.toDataURL(qrValue, {
    width: 320,
    margin: 1,
    errorCorrectionLevel: "M",
  });
  const supportEmail = process.env.ADMIN_USERNAME ?? "admin@example.com";
  const supportWhatsapp = (process.env.ADMIN_WHATSAPP ?? "").replace(/\D/g, "");
  const supportSubject = encodeURIComponent("Solicitud desde el sistema");
  const supportBody = encodeURIComponent(`Usuario: ${user.username}\n\nDetalle de la solicitud:`);
  const whatsappText = encodeURIComponent(`Hola, necesito ayuda en el sistema.\nUsuario: ${user.username}`);
  const totalUnits = user.items.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <main className="container user-dashboard">
      <header className="topbar">
        <div>
          <h1 className="title title-inline">
            <QrCode01Icon width={22} height={22} />
            {user.username}
          </h1>
        </div>
        <LogoutButton />
      </header>

      <section className="user-dashboard-grid">
        <article className="card form-grid user-hero-card">
          <div className="section-heading">
            <h2 className="subtitle">Resumen</h2>
            <span className="pill">{totalUnits} unidades</span>
          </div>

          <div className="ticket-cards-grid">
            {user.items.map((item) => {
              const percent = totalUnits > 0 ? Math.round((item.quantity / totalUnits) * 100) : 0;

              return (
                <article key={item.itemTypeId} className="ticket-card ticket-card-item">
                  <p className="ticket-card-label label-inline">
                    <Ticket01Icon width={14} height={14} />
                    {item.itemName}
                  </p>
                  <strong>{item.quantity}</strong>
                  <div className="ticket-track" aria-hidden="true">
                    <div className="ticket-fill" style={{ width: `${percent}%` }} />
                  </div>
                </article>
              );
            })}
          </div>

        </article>

        <article className="card form-grid user-qr-card">
          <div className="section-heading">
            <h2 className="subtitle">QR personal</h2>
          </div>

          <div className="qr-frame">
            <Image src={qrDataUrl} alt="QR de usuario" width={280} height={280} priority />
          </div>

          <div className="action-grid">
            <a className="btn-secondary" href={qrDataUrl} download={`qr-${user.username}.png`} title="Descargar QR" aria-label="Descargar QR">
              <span className="btn-inline">
                <Download01Icon width={14} height={14} />
                Descargar QR
              </span>
            </a>
            {supportWhatsapp ? (
              <a className="btn-secondary" href={`https://wa.me/${supportWhatsapp}?text=${whatsappText}`} target="_blank" rel="noreferrer" title="Soporte por WhatsApp" aria-label="Soporte por WhatsApp">
                <span className="btn-inline">
                  <MessageChatCircleIcon width={14} height={14} />
                  Soporte
                </span>
              </a>
            ) : (
              <a className="btn-secondary" href={`mailto:${encodeURIComponent(supportEmail)}?subject=${supportSubject}&body=${supportBody}`} title="Soporte por correo" aria-label="Soporte por correo">
                <span className="btn-inline">
                  <Mail01Icon width={14} height={14} />
                  Soporte
                </span>
              </a>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
