import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { readThemePreferences } from "@/lib/theme.server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Managoney",
  description: "Gestion de finanzas personales",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfc" },
    { media: "(prefers-color-scheme: dark)", color: "#22262e" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { theme, accent } = await readThemePreferences();

  return (
    <html
      lang="es"
      data-theme={theme}
      data-accent={accent}
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
      // El tema ya viene resuelto del servidor, pero las extensiones del
      // navegador suelen tocar el <html> y ensucian el diff de hidratacion.
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
