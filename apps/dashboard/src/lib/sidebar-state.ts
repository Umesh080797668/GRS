export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'grs_sidebar_collapsed';

const listeners = new Set<() => void>();
let memoryFallback: boolean | null = null;

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Reads the persisted desktop sidebar collapse state without throwing during
 * SSR or privacy-restricted storage modes.
 */
export function readSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
    if (stored === '1') {
      memoryFallback = true;
      return true;
    }
    if (stored === '0') {
      memoryFallback = false;
      return false;
    }
    return memoryFallback ?? false;
  } catch {
    return memoryFallback ?? false;
  }
}

/**
 * Persists the desktop sidebar collapse preference across page navigations and
 * reloads until toggled back by the user.
 */
export function writeSidebarCollapsed(next: boolean): boolean {
  memoryFallback = next;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, next ? '1' : '0');
    } catch {
      // Keep in-memory fallback for client-side navigation when storage is unavailable.
    }
  }
  notifyListeners();
  return next;
}

export function subscribeSidebarCollapsed(listener: () => void): () => void {
  listeners.add(listener);
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {
      listeners.delete(listener);
    };
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === SIDEBAR_COLLAPSED_STORAGE_KEY) {
      if (event.newValue === null) {
        memoryFallback = null;
      }
      listener();
    }
  };

  window.addEventListener('storage', handleStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window.removeEventListener === 'function') {
      window.removeEventListener('storage', handleStorage);
    }
  };
}

export function getServerSidebarCollapsed(): boolean {
  return false;
}

