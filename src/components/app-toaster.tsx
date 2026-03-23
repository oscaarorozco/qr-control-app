"use client";

import { Toaster } from "sonner";

export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      theme="dark"
      toastOptions={{
        style: {
          borderRadius: "12px",
          border: "1px solid #2a3240",
          background: "#10131a",
          color: "#f1f5f9",
        },
      }}
    />
  );
}
