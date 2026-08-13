import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import type { PluginListenerHandle } from '@capacitor/core';
import type { AppLifecycleState, PlatformAdapter } from './PlatformAdapter';
import { ZERO_SAFE_AREA } from './PlatformAdapter';

export class AndroidPlatformAdapter implements PlatformAdapter {
  readonly kind = 'android' as const;
  private readonly handles: PluginListenerHandle[] = [];

  async ready(): Promise<void> {}
  getSafeArea() {
    return ZERO_SAFE_AREA;
  }
  onSafeAreaChange(): () => void {
    return () => undefined;
  }

  onLifecycleChange(listener: (state: AppLifecycleState) => void): () => void {
    const handlePromise = App.addListener('appStateChange', ({ isActive }) => {
      listener(isActive ? 'active' : 'inactive');
    });
    void handlePromise.then((handle) => this.handles.push(handle));
    return () => void handlePromise.then((handle) => handle.remove());
  }

  onBack(listener: () => void): () => void {
    const handlePromise = App.addListener('backButton', listener);
    void handlePromise.then((handle) => this.handles.push(handle));
    return () => void handlePromise.then((handle) => handle.remove());
  }

  async setGameplayActive(): Promise<void> {}

  async haptic(): Promise<void> {
    await Haptics.impact({ style: ImpactStyle.Light });
  }

  async destroy(): Promise<void> {
    await Promise.all(this.handles.map((handle) => handle.remove()));
    this.handles.length = 0;
  }
}
