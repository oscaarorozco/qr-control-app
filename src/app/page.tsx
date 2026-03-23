import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth";

export const runtime = "nodejs";

export default async function Home() {
  const session = await getSessionFromCookies();

  if (!session) {
    redirect("/login");
  }

  if (session.role === "admin") {
    redirect("/admin");
  }

  redirect("/dashboard");
}
