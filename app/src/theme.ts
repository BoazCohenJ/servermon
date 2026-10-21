import { useColorScheme } from 'react-native';
import { Level } from './types';

const light = {
  bg: '#f4f5f7',
  card: '#ffffff',
  text: '#14171c',
  muted: '#6a7280',
  border: '#e2e5ea',
  track: '#e6e9ee',
  accent: '#2f6fed',
  ok: '#1a8f4c',
  warn: '#b7791f',
  crit: '#d03a3a',
  okBg: '#e4f5ea',
  warnBg: '#fbf0d9',
  critBg: '#fbe3e3',
};

export type Theme = typeof light;

const dark: Theme = {
  bg: '#0e1116',
  card: '#171b22',
  text: '#e8ebf0',
  muted: '#8b94a3',
  border: '#262c36',
  track: '#262c36',
  accent: '#6b9cff',
  ok: '#4cc27d',
  warn: '#e5b04a',
  crit: '#ff6b6b',
  okBg: '#14301f',
  warnBg: '#3a2e12',
  critBg: '#3d1a1a',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export function levelColor(t: Theme, l: Level) {
  return l === 'ok' ? t.ok : l === 'warn' ? t.warn : t.crit;
}

export function levelBg(t: Theme, l: Level) {
  return l === 'ok' ? t.okBg : l === 'warn' ? t.warnBg : t.critBg;
}
