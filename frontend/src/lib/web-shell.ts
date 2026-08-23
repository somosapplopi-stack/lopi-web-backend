import { Platform } from 'react-native';

/**
 * Web-only runtime injection of PWA + OpenGraph meta tags and a responsive
 * mobile-shell CSS. This is used because the Metro dev server serves its own
 * HTML template and does not apply `+html.tsx` in dev — the exported build
 * (via `expo export` / Publish) will use `+html.tsx` correctly.
 *
 * Safe to call on native too (it just no-ops).
 */
export function bootstrapWebHead(): void {
  if (Platform.OS !== 'web') return;
  if (typeof document === 'undefined') return;
  if (document.head.dataset.lopiBootstrapped === '1') return;
  document.head.dataset.lopiBootstrapped = '1';

  document.title = "LOPI — ¿Qué hay pa' hacer?";
  document.documentElement.lang = 'es';

  const metas: Array<[string, string, string]> = [
    ['name', 'description', 'LOPI es la red social de los parches. Descubre y únete a planes con amigos y personas nuevas en tu ciudad.'],
    ['name', 'theme-color', '#3B4CF6'],
    ['name', 'mobile-web-app-capable', 'yes'],
    ['name', 'apple-mobile-web-app-capable', 'yes'],
    ['name', 'apple-mobile-web-app-title', 'LOPI'],
    ['name', 'apple-mobile-web-app-status-bar-style', 'black-translucent'],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', "LOPI — ¿Qué hay pa' hacer?"],
    ['name', 'twitter:description', 'Descubre y únete a parches con amigos y personas nuevas en tu ciudad.'],
    ['name', 'twitter:image', '/icon.png'],
    ['property', 'og:title', "LOPI — ¿Qué hay pa' hacer?"],
    ['property', 'og:description', 'Descubre y únete a parches con amigos y personas nuevas en tu ciudad.'],
    ['property', 'og:type', 'website'],
    ['property', 'og:image', '/icon.png'],
    ['property', 'og:locale', 'es_CO'],
  ];

  for (const [kind, key, value] of metas) {
    if (document.querySelector(`meta[${kind}="${key}"]`)) continue;
    const el = document.createElement('meta');
    el.setAttribute(kind, key);
    el.setAttribute('content', value);
    document.head.appendChild(el);
  }

  const links: Array<[string, string, string | undefined]> = [
    ['manifest', '/manifest.webmanifest', undefined],
    ['apple-touch-icon', '/icon.png', undefined],
    ['icon', '/favicon.png', 'image/png'],
  ];
  for (const [rel, href, type] of links) {
    if (document.querySelector(`link[rel="${rel}"]`)) continue;
    const el = document.createElement('link');
    el.rel = rel;
    el.href = href;
    if (type) el.type = type;
    document.head.appendChild(el);
  }

  // Responsive mobile-shell: center the app with a max-width on desktop.
  if (!document.getElementById('lopi-shell-css')) {
    const s = document.createElement('style');
    s.id = 'lopi-shell-css';
    s.textContent = `
      html, body { background: #EEF1FB; margin: 0; }
      body { display: flex; justify-content: center; }
      #root { max-width: 480px !important; width: 100% !important; height: 100vh !important; background: #ffffff !important; box-shadow: 0 0 30px rgba(59,76,246,0.15); overflow: hidden; flex: initial !important; margin: 0 auto !important; position: relative !important; }
      @media (max-width: 520px) {
        #root { max-width: 100% !important; box-shadow: none !important; }
      }
    `;
    document.head.appendChild(s);
  }

  // Register service worker for PWA installability (dev + prod).
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* ignored */ });
  }
}
