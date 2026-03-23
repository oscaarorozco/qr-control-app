import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import { AppToaster } from "@/components/app-toaster";
import "./globals.css";

const uiSans = Space_Grotesk({
  variable: "--font-ui-sans",
  subsets: ["latin"],
});

const uiMono = IBM_Plex_Mono({
  variable: "--font-ui-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sistema de Control",
  description: "Panel de control con acceso por QR",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${uiSans.variable} ${uiMono.variable} antialiased`}
      >
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
