export type TelegramInset = { top: number; right: number; bottom: number; left: number };

export interface TelegramWebApp {
  isActive?: boolean;
  safeAreaInset?: TelegramInset;
  contentSafeAreaInset?: TelegramInset;
  HapticFeedback?: { impactOccurred(style: 'light' | 'medium' | 'heavy'): void };
  ready(): void;
  expand(): void;
  requestFullscreen?: () => void;
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  onEvent(event: string, callback: () => void): void;
  offEvent(event: string, callback: () => void): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}
