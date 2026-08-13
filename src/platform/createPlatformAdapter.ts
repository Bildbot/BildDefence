import { Capacitor } from '@capacitor/core';
import { AndroidPlatformAdapter } from './AndroidPlatformAdapter';
import { BrowserPlatformAdapter } from './BrowserPlatformAdapter';
import type { PlatformAdapter } from './PlatformAdapter';
import { TelegramPlatformAdapter } from './TelegramPlatformAdapter';
import './telegram-types';

const TELEGRAM_SCRIPT = 'https://telegram.org/js/telegram-web-app.js?63';

export async function createPlatformAdapter(): Promise<PlatformAdapter> {
  if (Capacitor.isNativePlatform()) return new AndroidPlatformAdapter();
  if (!isTelegramLaunch()) return new BrowserPlatformAdapter();

  try {
    await loadTelegramBridge();
    if (window.Telegram?.WebApp) return new TelegramPlatformAdapter(window.Telegram.WebApp);
  } catch {
    // Telegram integration must never prevent ordinary browser startup.
  }
  return new BrowserPlatformAdapter();
}

export function isTelegramLaunch(
  locationLike: Pick<Location, 'search' | 'hash'> = window.location,
): boolean {
  return `${locationLike.search}${locationLike.hash}`.includes('tgWebApp');
}

async function loadTelegramBridge(): Promise<void> {
  if (window.Telegram?.WebApp) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TELEGRAM_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Telegram bridge failed to load'));
    document.head.append(script);
  });
}
