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
  // iOS no lee el manifiesto: para abrir sin barra de direcciones necesita sus
  // propias meta. `statusBarStyle: "default"` deja que la barra de estado tome
  // el color del `themeColor` de abajo, asi acompana el tema claro u oscuro.
  appleWebApp: {
    title: "Managoney",
    statusBarStyle: "default",
    capable: true,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfc" },
    { media: "(prefers-color-scheme: dark)", color: "#22262e" },
  ],
  // Sin esto `env(safe-area-inset-*)` vale siempre 0 y la barra inferior queda
  // debajo de la raya de gestos del iPhone. Ver `nav-menu.tsx`.
  viewportFit: "cover",
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
