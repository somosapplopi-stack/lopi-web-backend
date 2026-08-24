import { Platform, Share } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Cross-platform helpers so mobile-only native APIs degrade gracefully on web.
 * On native they behave exactly as before; on web they no-op or use the
 * equivalent Web API (Web Share API / Clipboard).
 */

export const haptics = {
  impact(): void {
    if (Platform.OS === 'web') return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* ignore */ }
  },
  selection(): void {
    if (Platform.OS === 'web') return;
    try { Haptics.selectionAsync(); } catch { /* ignore */ }
  },
  success(): void {
    if (Platform.OS === 'web') return;
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { /* ignore */ }
  },
};

export type ShareResult = 'shared' | 'copied' | 'unavailable';

/**
 * Share content. Native uses the OS share sheet; web uses the Web Share API
 * when available and falls back to copying the link to the clipboard.
 */
export async function shareContent(opts: { title?: string; message: string; url?: string }): Promise<ShareResult> {
  if (Platform.OS === 'web') {
    const nav: any = typeof navigator !== 'undefined' ? navigator : null;
    if (nav?.share) {
      try {
        await nav.share({ title: opts.title, text: opts.message, url: opts.url });
        return 'shared';
      } catch (e: any) {
        if (e?.name === 'AbortError') return 'shared'; // user closed the sheet
        // otherwise fall through to clipboard
      }
    }
    const toCopy = opts.url ? `${opts.message}` : opts.message;
    try {
      if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(toCopy);
        return 'copied';
      }
    } catch { /* ignore */ }
    return 'unavailable';
  }
  try {
    await Share.share({ message: opts.message, url: opts.url, title: opts.title });
    return 'shared';
  } catch {
    return 'unavailable';
  }
}
