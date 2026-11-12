import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  getServerSidebarCollapsed,
  readSidebarCollapsed,
  subscribeSidebarCollapsed,
  writeSidebarCollapsed,
} from './sidebar-state.ts';

function withMockWindow(
  storageMap: Map<string, string>,
  options?: { throwOnStorage?: boolean },
) {
  const prevWindow = (globalThis as { window?: unknown }).window;
  const listeners = new Map<string, Set<(event: unknown) => void>>();

  const mockWindow = {
    localStorage: {
      getItem(key: string) {
        if (options?.throwOnStorage) throw new Error('storage blocked');
        return storageMap.has(key) ? storageMap.get(key)! : null;
      },
      setItem(key: string, value: string) {
        if (options?.throwOnStorage) throw new Error('storage blocked');
        storageMap.set(key, value);
      },
    },
    addEventListener(type: string, fn: (event: unknown) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: (event: unknown) => void) {
      listeners.get(type)?.delete(fn);
    },
    dispatchStorage(key: string | null, newValue: string | null) {
      for (const fn of listeners.get('storage') ?? []) {
        fn({ key, newValue });
      }
    },
  };

  (globalThis as { window?: unknown }).window = mockWindow;
  return {
    mockWindow,
    restore() {
      if (prevWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as { window?: unknown }).window = prevWindow;
      }
    },
  };
}

describe('sidebar-state persistence', () => {
  it('defaults to expanded during SSR and before any user toggle', () => {
    assert.equal(getServerSidebarCollapsed(), false);
    const { restore } = withMockWindow(new Map());
    try {
      assert.equal(readSidebarCollapsed(), false);
    } finally {
      restore();
    }
  });

  it('persists collapsed state across simulated page remounts until user expands it', () => {
    const store = new Map<string, string>();
    const { restore } = withMockWindow(store);
    try {
      let notifications = 0;
      const unsubscribeFirstShell = subscribeSidebarCollapsed(() => {
        notifications += 1;
      });

      writeSidebarCollapsed(true);
      assert.equal(store.get(SIDEBAR_COLLAPSED_STORAGE_KEY), '1');
      assert.equal(notifications, 1);
      assert.equal(readSidebarCollapsed(), true);

      // Simulate navigating to another page where the previous Shell unmounts and a new Shell mounts.
      unsubscribeFirstShell();
      assert.equal(readSidebarCollapsed(), true);

      writeSidebarCollapsed(false);
      assert.equal(store.get(SIDEBAR_COLLAPSED_STORAGE_KEY), '0');
      assert.equal(readSidebarCollapsed(), false);
    } finally {
      restore();
    }
  });

  it('syncs external cross-tab storage updates and keeps memory fallback when localStorage throws', () => {
    const store = new Map<string, string>();
    const env = withMockWindow(store);
    try {
      let notifications = 0;
      const unsubscribe = subscribeSidebarCollapsed(() => {
        notifications += 1;
      });

      store.set(SIDEBAR_COLLAPSED_STORAGE_KEY, '1');
      env.mockWindow.dispatchStorage(SIDEBAR_COLLAPSED_STORAGE_KEY, '1');
      assert.equal(notifications, 1);
      assert.equal(readSidebarCollapsed(), true);

      writeSidebarCollapsed(false);
      unsubscribe();
    } finally {
      env.restore();
    }

    const blockedEnv = withMockWindow(new Map(), { throwOnStorage: true });
    try {
      writeSidebarCollapsed(true);
      assert.equal(readSidebarCollapsed(), true);
      writeSidebarCollapsed(false);
      assert.equal(readSidebarCollapsed(), false);
    } finally {
      blockedEnv.restore();
    }
  });
});

