// @ts-nocheck
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

// Custom HTML shell for the web build (Expo SDK 54). Adds PWA/OG meta tags so
// LOPI looks great when shared to WhatsApp/Twitter and installs as a PWA.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="es" style={{ height: "100%" }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />

        <title>LOPI — ¿Qué hay pa&apos; hacer?</title>
        <meta
          name="description"
          content="LOPI es la red social de los parches. Descubre y únete a planes con amigos y personas nuevas en tu ciudad."
        />
        <meta name="theme-color" content="#3B4CF6" />

        {/* PWA */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="LOPI" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icon.png" />
        <link rel="icon" type="image/png" href="/favicon.png" />

        {/* Open Graph (WhatsApp / Facebook / LinkedIn) */}
        <meta property="og:title" content="LOPI — ¿Qué hay pa' hacer?" />
        <meta
          property="og:description"
          content="Descubre y únete a parches con amigos y personas nuevas en tu ciudad."
        />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="/icon.png" />
        <meta property="og:locale" content="es_CO" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="LOPI — ¿Qué hay pa' hacer?" />
        <meta
          name="twitter:description"
          content="Descubre y únete a parches con amigos y personas nuevas en tu ciudad."
        />
        <meta name="twitter:image" content="/icon.png" />

        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body { margin: 0; height: 100%; background: #EEF1FB; }
              body > div:first-child { position: fixed !important; top: 0; left: 0; right: 0; bottom: 0; display: flex; justify-content: center; background: #EEF1FB; }
              body > div:first-child > * { width: 100%; max-width: 480px; height: 100%; background: #ffffff; box-shadow: 0 0 30px rgba(59, 76, 246, 0.15); overflow: hidden; }
              @media (max-width: 520px) {
                body > div:first-child > * { max-width: 100%; box-shadow: none; }
              }
              [role="tablist"] [role="tab"] * { overflow: visible !important; }
              [role="heading"], [role="heading"] * { overflow: visible !important; }
              input, textarea { font-family: inherit; }
            `,
          }}
        />
      </head>
      <body
        style={{
          margin: 0,
          height: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </body>
    </html>
  );
}
