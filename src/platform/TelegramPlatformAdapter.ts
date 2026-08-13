import type { AppLifecycleState, PlatformAdapter, SafeAreaInsets } from './PlatformAdapter';
import { ZERO_SAFE_AREA } from './PlatformAdapter';
import type { TelegramWebApp } from './telegram-types';

export class TelegramPlatformAdapter implements PlatformAdapter {
  readonly kind = 'telegram' as const;
  private readonly cleanup = new Set<() => void>();

  constructor(private readonly webApp: TelegramWebApp) {}

  async ready(): Promise<void> {
    this.webApp.ready();
    this.webApp.expand();
  }

  getSafeArea(): SafeAreaInsets {
    const outer = this.webApp.safeAreaInset ?? ZERO_SAFE_AREA;
    const content = this.webApp.contentSafeAreaInset ?? ZERO_SAFE_AREA;
    return {
      top: Math.max(outer.top, content.top),
      right: Math.max(outer.right, content.right),
      bottom: Math.max(outer.bottom, content.bottom),
      left: Math.max(outer.left, content.left),
    };
  }

  onSafeAreaChange(listener: (insets: SafeAreaInsets) => void): () => void {
    const handleChange = () => listener(this.getSafeArea());
    const events = ['safeAreaChanged', 'contentSafeAreaChanged', 'viewportChanged'];
    events.forEach((event) => this.webApp.onEvent(event, handleChange));
    const unsubscribe = () => events.forEach((event) => this.webApp.offEvent(event, handleChange));
    this.cleanup.add(unsubscribe);
    return unsubscribe;
  }

  onLifecycleChange(listener: (state: AppLifecycleState) => void): () => void {
    const activated = () => listener('active');
    const deactivated = () => listener('inactive');
    this.webApp.onEvent('activated', activated);
    this.webApp.onEvent('deactivated', deactivated);
    const unsubscribe = () => {
      this.webApp.offEvent('activated', activated);
      this.webApp.offEvent('deactivated', deactivated);
    };
    this.cleanup.add(unsubscribe);
    return unsubscribe;
  }

  onBack(listener: () => void): () => void {
    this.webApp.onEvent('backButtonClicked', listener);
    const unsubscribe = () => this.webApp.offEvent('backButtonClicked', listener);
    this.cleanup.add(unsubscribe);
    return unsubscribe;
  }

  async setGameplayActive(active: boolean): Promise<void> {
    if (active) {
      this.webApp.disableVerticalSwipes?.();
      return;
    }
    this.webApp.enableVerticalSwipes?.();
  }

  async haptic(): Promise<void> {
    this.webApp.HapticFeedback?.impactOccurred('light');
  }

  async destroy(): Promise<void> {
    this.cleanup.forEach((unsubscribe) => unsubscribe());
    this.cleanup.clear();
  }
}
