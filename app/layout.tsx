import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Réservations — Les Oiseaux",
  manifest: "/manifest.webmanifest",
  robots: { index: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#111111" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr-CA">
      <body>{children}</body>
    </html>
  );
}
