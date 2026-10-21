import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Settings, fetchHistory, fetchStatus, loadSettings, saveSettings } from './src/api';
import { ErrorBanner } from './src/components/ui';
import { ago } from './src/format';
import Disks from './src/screens/Disks';
import Overview from './src/screens/Overview';
import ServicesScreen from './src/screens/Services';
import SettingsScreen from './src/screens/Settings';
import { levelColor, useTheme } from './src/theme';
import { History, Snapshot } from './src/types';

type Tab = 'overview' | 'disks' | 'services' | 'settings';
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'disks', label: 'Disks' },
  { key: 'services', label: 'Services' },
  { key: 'settings', label: 'Settings' },
];
const POLL_MS = 60_000;

function Main() {
  const t = useTheme();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const settingsRef = useRef<Settings | null>(null);

  const refresh = useCallback(async () => {
    const s = settingsRef.current;
    if (!s || !s.baseUrl || !s.token) return;
    try {
      const [status, hist] = await Promise.all([fetchStatus(s), fetchHistory(s, 60).catch(() => null)]);
      setSnap(status);
      if (hist) setHistory(hist);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    loadSettings().then((s) => {
      settingsRef.current = s;
      setSettings(s);
      if (!s.baseUrl || !s.token) setTab('settings');
      else refresh();
    });
  }, [refresh]);

  // poll while the app is in the foreground
  useEffect(() => {
    const id = setInterval(() => AppState.currentState === 'active' && refresh(), POLL_MS);
    const sub = AppState.addEventListener('change', (st) => st === 'active' && refresh());
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [refresh]);

  const onSave = async (s: Settings) => {
    await saveSettings(s);
    settingsRef.current = s;
    setSettings(s);
    setSnap(null);
    setHistory(null);
    setError(null);
    setTab('overview');
    refresh();
  };

  const onPull = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  if (!settings) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top', 'bottom']}>
      <StatusBar style="auto" />
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
        <Text style={{ color: t.text, fontSize: 26, fontWeight: '800' }}>
          {TABS.find((x) => x.key === tab)?.label}
        </Text>
        {snap && tab !== 'settings' && (
          <Text style={{ color: snap.stale ? t.warn : t.muted, fontSize: 12 }}>
            {snap.stale ? 'Data is stale · ' : ''}updated {ago(snap.collected_at, snap.server_time)}
          </Text>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPull} />}
      >
        {error && tab !== 'settings' ? <ErrorBanner message={error} /> : null}
        {tab === 'settings' ? (
          <SettingsScreen initial={settings} onSave={onSave} error={error} />
        ) : !snap ? (
          !error && <Text style={{ color: t.muted }}>Loading…</Text>
        ) : tab === 'overview' ? (
          <Overview snap={snap} />
        ) : tab === 'disks' ? (
          <Disks disks={snap.disks} history={history} />
        ) : (
          <ServicesScreen services={snap.services} />
        )}
      </ScrollView>

      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.card }}>
        {TABS.map((x) => {
          const active = x.key === tab;
          const badge =
            snap && x.key === 'disks'
              ? worstOf(snap.disks.map((d) => d.status))
              : snap && x.key === 'services'
                ? worstOf(snap.services.map((d) => d.status))
                : 'ok';
          return (
            <Pressable key={x.key} onPress={() => setTab(x.key)} style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}>
              <Text style={{ color: active ? t.accent : t.muted, fontWeight: active ? '700' : '500', fontSize: 14 }}>
                {x.label}
                {badge !== 'ok' ? <Text style={{ color: levelColor(t, badge) }}> ●</Text> : null}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

function worstOf(levels: ('ok' | 'warn' | 'crit')[]): 'ok' | 'warn' | 'crit' {
  return levels.includes('crit') ? 'crit' : levels.includes('warn') ? 'warn' : 'ok';
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}
