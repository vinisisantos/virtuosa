import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ClientProviders } from '@/components/client-providers';

export const metadata: Metadata = {
  title: "Virtuosa",
  description: "Sistema de gestão Virtuosa Estética",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Virtuosa",
  },
};

export const viewport: Viewport = {
  themeColor: "#e6007e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="icon" href="/logo-virtuosa.png" type="image/png" />
        <link rel="apple-touch-icon" href="/logo-virtuosa.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        />
      </head>
      <body>
        <ClientProviders>
        {children}
        </ClientProviders>
        {/* Auth gate — redirect to login before React hydrates if not logged in */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var isLoginPage = window.location.pathname === '/login.html' || window.location.pathname === '/login';
                if (!isLoginPage && !localStorage.getItem('virtuosa_user')) {
                  window.location.replace('/login.html');
                }
                if (isLoginPage && localStorage.getItem('virtuosa_user')) {
                  window.location.replace('/dashboard');
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
