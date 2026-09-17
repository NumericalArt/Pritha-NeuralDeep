import type { Metadata } from "next";
import Script from "next/script";
import { AppShell } from "@/components/shell/AppShell";
import { ThemeSync } from "@/components/shell/ThemeSync";
import { themeInitScript } from "@/lib/theme";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Pritha Control Center",
  description: "Local control center for Pritha and child agents.",
  icons: {
    icon: "/favicon_ND.png",
    shortcut: "/favicon_ND.png",
    // Keep the in-app logo independent from the iOS home-screen icon.
    apple: "/logo_6.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="pritha-theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeSync />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
