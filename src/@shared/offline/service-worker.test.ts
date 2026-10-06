import { describe, expect, it } from 'vitest';

import {
  OFFLINE_DATA,
  OFFLINE_NAVIGATIONS,
  serviceWorkerSource,
} from './service-worker';

describe('serviceWorkerSource', () => {
  it('is valid JavaScript with the build stamped in', () => {
    const a = serviceWorkerSource('build-a');
    const b = serviceWorkerSource('build-b');
    expect(() => new Function(a)).not.toThrow();
    expect(a).toContain('const VERSION = "build-a";');
    // A deploy changes the bytes, which is what rolls clients forward.
    expect(a).not.toBe(b);
  });

  it('never touches auth, the live stream or a write', () => {
    const src = serviceWorkerSource('x');
    expect(src).toContain("path.startsWith('/api/auth')");
    expect(src).toContain("path.endsWith('/live')");
    expect(src).toContain("request.method !== 'GET'");
  });

  it('keys the data cache by user', () => {
    expect(serviceWorkerSource('x')).toContain('caches.open(DATA + user)');
  });
});

describe('what is kept offline', () => {
  const nav = (p: string) => OFFLINE_NAVIGATIONS.some(r => r.test(p));
  const data = (p: string) => OFFLINE_DATA.some(r => r.test(p));

  it('the session screen and a hero’s play page', () => {
    expect(nav('/campaigns/abc/screen')).toBe(true);
    expect(nav('/characters/abc/play')).toBe(true);
    expect(nav('/campaigns/abc')).toBe(false);
    expect(nav('/campaigns/abc/screen/extra')).toBe(false);
    expect(nav('/admin')).toBe(false);
  });

  it('the live state, and not the stream beside it', () => {
    expect(data('/api/campaigns/abc/state')).toBe(true);
    expect(data('/api/campaigns/abc/live')).toBe(false);
    expect(data('/api/campaigns/abc/images/x')).toBe(false);
  });
});
