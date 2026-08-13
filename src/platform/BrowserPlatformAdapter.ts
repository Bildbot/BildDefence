import type { PlatformAdapter } from './PlatformAdapter';
import { ZERO_SAFE_AREA } from './PlatformAdapter';

export class BrowserPlatformAdapter implements PlatformAdapter {
  readonly kind = 'browser' as const;

  async ready(): Promise<void> {}
  getSafeArea() {
    return ZERO_SAFE_AREA;
  }
  onSafeAreaChange(): () => void {
    return () => undefined;
  }
  onLifecycleChange(listener: (state: 'active' | 'inactive') => void): () => void {
    const handleVisibility = () => listener(document.hidden ? 'inactive' : 'active');
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }
  onBack(): () => void {
    return () => undefined;
  }
  async setGameplayActive(): Promise<void> {}
  async haptic(): Promise<void> {}
  async destroy(): Promise<void> {}
}
