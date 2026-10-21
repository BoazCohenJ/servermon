import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { History, Snapshot } from './types';

export interface Settings {
  baseUrl: string;
  token: string;
}

const URL_KEY = 'servermon.baseUrl';
const TOKEN_KEY = 'servermon.token';

export async function loadSettings(): Promise<Settings> {
  const [baseUrl, token] = await Promise.all([
    AsyncStorage.getItem(URL_KEY),
    SecureStore.getItemAsync(TOKEN_KEY),
  ]);
  return { baseUrl: baseUrl ?? '', token: token ?? '' };
}

export async function saveSettings(s: Settings): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(URL_KEY, s.baseUrl),
    SecureStore.setItemAsync(TOKEN_KEY, s.token),
  ]);
}

export function normalizeUrl(raw: string): string {
  let u = raw.trim().replace(/\/+$/, '');
  if (u && !/^https?:\/\//i.test(u)) u = `http://${u}`;
  return u;
}

async function get<T>(s: Settings, path: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(`${normalizeUrl(s.baseUrl)}${path}`, {
      headers: { Authorization: `Bearer ${s.token}` },
      signal: ctrl.signal,
    });
    if (res.status === 401) throw new Error('Token rejected by server (401)');
    if (res.status === 503) throw new Error('Server is up but the collector has not produced data yet');
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    return (await res.json()) as T;
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') throw new Error('Timed out. Is the server reachable (VPN on)?');
    if (e instanceof TypeError) throw new Error('Cannot reach server. Check the address and your network/VPN.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const fetchStatus = (s: Settings) => get<Snapshot>(s, '/api/status');
export const fetchHistory = (s: Settings, days = 60) => get<History>(s, `/api/history?days=${days}`);
