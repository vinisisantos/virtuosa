import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ClientProviders } from '@/components/client-providers';
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Virtuosa",
  description: "Sistema de gestão Virtuosa Estética",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Virtuosa",
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  themeColor: "#0b141a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`${inter.variable} dark`} data-mode="dark" data-theme="dark">
      <head>
        <link rel="icon" href="/logo-virtuosa.png" type="image/png" />
        <link rel="apple-touch-icon" href="/logo-virtuosa.png" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700;800;900&display=swap"
        />
      </head>
      <body>
        <ClientProviders>
        {children}
        </ClientProviders>
        <Analytics />
        <SpeedInsights />
        {/* Auth gate — redirect to login before React hydrates if not logged in */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var isLoginPage = window.location.pathname === '/login.html' || window.location.pathname === '/login';
                var isPublicPage = isLoginPage || window.location.pathname.startsWith('/assinar') || window.location.pathname.startsWith('/avaliar');
                if (!isPublicPage && !localStorage.getItem('virtuosa_user')) {
                  window.location.replace('/login.html');
                }
                if (isLoginPage && localStorage.getItem('virtuosa_user')) {
                  window.location.replace('/agenda');
                }
              })();
            `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(() => {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
