// Web storage (Metro picks index.ts on native).
// Uses window.localStorage directly: it is synchronous, reliable and persistent
// across reloads. We intentionally do NOT use AsyncStorage on web because its
// IndexedDB-backed shim can hang on a cold page load (blocking the auth
// bootstrap) and has flaky writes inside sandboxed preview iframes.
// Helpers never throw: reads return `fallback`, writes return `false`.

import { AssertNoExtras, StorageBase, StorageItemValue } from "./storage-base";

function ls(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    /* access to localStorage can throw in some sandboxes */
  }
  return null;
}

// Fallback in-memory map when localStorage is unavailable (private mode, etc.)
const memory = new Map<string, string>();

function readRaw(key: string): string | null {
  const store = ls();
  if (store) {
    try { return store.getItem(key); } catch { /* fall through */ }
  }
  return memory.has(key) ? (memory.get(key) as string) : null;
}

function writeRaw(key: string, value: string): boolean {
  const store = ls();
  if (store) {
    try { store.setItem(key, value); return true; } catch { /* fall through */ }
  }
  memory.set(key, value);
  return true;
}

function deleteRaw(key: string): boolean {
  const store = ls();
  if (store) {
    try { store.removeItem(key); } catch { /* fall through */ }
  }
  memory.delete(key);
  return true;
}

class Storage extends StorageBase {
  async getItem<Fallback extends StorageItemValue>(
    key: string,
    fallback: Fallback,
  ): Promise<Fallback | null> {
    try {
      return this.retrieve(readRaw(key), fallback);
    } catch (e) {
      this.warn("getItem", key, e);
      return fallback;
    }
  }

  async setItem<Value extends StorageItemValue>(
    key: string,
    value: Value,
  ): Promise<boolean> {
    try {
      return writeRaw(key, JSON.stringify(value));
    } catch (e) {
      this.warn("setItem", key, e);
      return false;
    }
  }

  async removeItem(key: string): Promise<boolean> {
    try {
      return deleteRaw(key);
    } catch (e) {
      this.warn("removeItem", key, e);
      return false;
    }
  }

  // Browsers have no Keychain — secure* helpers fall through to localStorage.
  async secureGet<Fallback extends StorageItemValue>(
    key: string,
    fallback: Fallback,
  ): Promise<Fallback | null> {
    return this.getItem(key, fallback);
  }

  async secureSet<Value extends StorageItemValue>(
    key: string,
    value: Value,
  ): Promise<boolean> {
    return this.setItem(key, value);
  }

  async secureRemove(key: string): Promise<boolean> {
    return this.removeItem(key);
  }
}

export const storage = new Storage();

// Compile-time guard: any new method must be declared in storage-base.ts first.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- intentional compile-time-only assertion
type _NoExtras = AssertNoExtras<Exclude<keyof Storage, keyof StorageBase>>;
