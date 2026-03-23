import { redirect } from "next/navigation";
import { Shield01Icon } from "@untitledui/icons-react/outline";
import { AdminPanel } from "@/components/admin-panel";
import { LogoutButton } from "@/components/logout-button";
import { getSessionFromCookies } from "@/lib/auth";

export const runtime = "nodejs";

export default async function AdminPage() {
  const session = await getSessionFromCookies();

  if (!session) {
    redirect("/login");
  }

  if (session.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <main className="container admin-page">
      <header className="topbar">
        <div>
          <h1 className="title title-inline">
            <Shield01Icon width={22} height={22} />
            Panel admin
          </h1>
        </div>
        <LogoutButton />
      </header>

      <AdminPanel adminScope={session.adminScope ?? "admin"} currentAdminId={session.userId} />
    </main>
  );
}
