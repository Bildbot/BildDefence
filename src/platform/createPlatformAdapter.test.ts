import { describe, expect, it } from 'vitest';
import { BrowserPlatformAdapter } from './BrowserPlatformAdapter';
import { isTelegramLaunch } from './createPlatformAdapter';

describe('platform selection', () => {
  it('does not treat an ordinary browser location as Telegram', () => {
    expect(isTelegramLaunch({ search: '', hash: '' })).toBe(false);
    expect(isTelegramLaunch({ search: '?mode=preview', hash: '#home' })).toBe(false);
  });

  it('recognizes Telegram launch parameters', () => {
    expect(isTelegramLaunch({ search: '?tgWebAppPlatform=android', hash: '' })).toBe(true);
  });

  it('provides a no-op adapter for an ordinary browser', () => {
    const adapter = new BrowserPlatformAdapter();
    expect(adapter.kind).toBe('browser');
  });
});
