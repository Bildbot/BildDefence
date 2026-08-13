export type PlatformKind = 'browser' | 'telegram' | 'android';

export type SafeAreaInsets = Readonly<{
  top: number;
  right: number;
  bottom: number;
  left: number;
}>;

export type AppLifecycleState = 'active' | 'inactive';

export interface PlatformAdapter {
  readonly kind: PlatformKind;
  ready(): Promise<void>;
  getSafeArea(): SafeAreaInsets;
  onSafeAreaChange(listener: (insets: SafeAreaInsets) => void): () => void;
  onLifecycleChange(listener: (state: AppLifecycleState) => void): () => void;
  onBack(listener: () => void): () => void;
  setGameplayActive(active: boolean): Promise<void>;
  haptic(): Promise<void>;
  destroy(): Promise<void>;
}

export const ZERO_SAFE_AREA: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };
