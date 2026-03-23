"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut03Icon } from "@untitledui/icons-react/outline";

export function LogoutButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onLogout() {
    setLoading(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      router.push("/login");
      router.refresh();
      setLoading(false);
    }
  }

  return (
    <button className="btn-quiet" onClick={onLogout} disabled={loading}>
      <span className="btn-inline">
        <LogOut03Icon width={16} height={16} />
        {loading ? "Cerrando..." : "Cerrar sesión"}
      </span>
    </button>
  );
}
