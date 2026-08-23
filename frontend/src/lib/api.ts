import { storage } from '@/src/utils/storage';

const TOKEN_KEY = 'lopi_auth_token';

export const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

async function getToken(): Promise<string | null> {
  return (await storage.secureGet<string>(TOKEN_KEY, '')) || null;
}

export async function setAuthToken(token: string | null): Promise<void> {
  if (token) await storage.secureSet(TOKEN_KEY, token);
  else await storage.secureRemove(TOKEN_KEY);
}

export async function getAuthToken(): Promise<string | null> {
  return getToken();
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
  auth?: boolean;
};

export async function api<T = any>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = `${BASE_URL}/api${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const auth = opts.auth ?? true;
  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers,
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && data.detail) || (typeof data === 'string' ? data : `Error ${res.status}`);
    throw new Error(Array.isArray(msg) ? msg.map((m: any) => m.msg).join(', ') : String(msg));
  }
  return data as T;
}

export function fileUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;
  if (path.startsWith('/api/')) return `${BASE_URL}${path}`;
  return `${BASE_URL}/api/files/${path}`;
}

/**
 * Upload an image to backend. Returns a public API path we store as `photo`.
 */
export async function uploadImage(uri: string): Promise<string> {
  const token = await getToken();
  const form = new FormData();
  const filename = uri.split('/').pop() || `photo-${Date.now()}.jpg`;
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase()}` : 'image/jpeg';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form.append('file', { uri, name: filename, type } as any);
  const res = await fetch(`${BASE_URL}/api/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Upload falló: ${t}`);
  }
  const data = await res.json();
  // Return the API-served URL so frontend just consumes it.
  return `${BASE_URL}${data.url}`;
}
