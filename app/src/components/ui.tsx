import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { levelBg, levelColor, useTheme } from '../theme';
import { Level } from '../types';

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <View style={[s.card, { backgroundColor: t.card, borderColor: t.border }, style]}>{children}</View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  const t = useTheme();
  return <Text style={[s.section, { color: t.muted }]}>{children.toUpperCase()}</Text>;
}

export function Pill({ level, label }: { level: Level; label?: string }) {
  const t = useTheme();
  const text = label ?? (level === 'ok' ? 'Healthy' : level === 'warn' ? 'Warning' : 'Critical');
  return (
    <View style={[s.pill, { backgroundColor: levelBg(t, level) }]}>
      <View style={[s.dot, { backgroundColor: levelColor(t, level) }]} />
      <Text style={[s.pillText, { color: levelColor(t, level) }]}>{text}</Text>
    </View>
  );
}

export function Bar({ pct, level = 'ok' }: { pct: number; level?: Level }) {
  const t = useTheme();
  return (
    <View style={[s.track, { backgroundColor: t.track }]}>
      <View
        style={{
          width: `${Math.max(0, Math.min(100, pct))}%`,
          height: '100%',
          borderRadius: 4,
          backgroundColor: level === 'ok' ? t.accent : levelColor(t, level),
        }}
      />
    </View>
  );
}

export function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  const t = useTheme();
  return (
    <View style={s.row}>
      <Text style={[s.rowLabel, { color: t.muted }]}>{label}</Text>
      <Text style={[s.rowValue, { color: valueColor ?? t.text }]}>{value}</Text>
    </View>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={[s.statLabel, { color: t.muted }]}>{label}</Text>
      <Text style={[s.statValue, { color: t.text }]}>{value}</Text>
      {sub ? <Text style={[s.statSub, { color: t.muted }]}>{sub}</Text> : null}
    </View>
  );
}

/** Tiny bar chart, no SVG dependency. */
export function Trend({
  values,
  height = 44,
  level = 'ok',
}: {
  values: number[];
  height?: number;
  level?: Level;
}) {
  const t = useTheme();
  if (values.length < 2) {
    return <Text style={{ color: t.muted, fontSize: 12 }}>Not enough history yet</Text>;
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const span = Math.max(max - min, 1);
  // Bars are scaled between min and max so small changes stay visible.
  const bars = values.length > 60 ? sample(values, 60) : values;
  return (
    <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
      {bars.map((v, i) => {
        const h = 6 + ((v - min) / span) * (height - 6);
        return (
          <View
            key={i}
            style={{
              flex: 1,
              height: h,
              borderRadius: 2,
              backgroundColor: i === bars.length - 1 ? levelColor(t, level === 'ok' ? 'ok' : level) : t.track,
              opacity: i === bars.length - 1 ? 1 : 0.9,
            }}
          />
        );
      })}
    </View>
  );
}

function sample(a: number[], n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(a[Math.floor((i * (a.length - 1)) / (n - 1))]);
  return out;
}

export function ErrorBanner({ message }: { message: string }) {
  const t = useTheme();
  return (
    <View style={[s.banner, { backgroundColor: t.critBg }]}>
      <Text style={{ color: t.crit, fontSize: 14 }}>{message}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, marginBottom: 12 },
  section: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, marginTop: 8, marginBottom: 8, marginLeft: 4 },
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  dot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  pillText: { fontSize: 12, fontWeight: '600' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { fontSize: 14 },
  rowValue: { fontSize: 14, fontWeight: '500', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  statLabel: { fontSize: 12 },
  statValue: { fontSize: 22, fontWeight: '700', marginTop: 2 },
  statSub: { fontSize: 12, marginTop: 2 },
  banner: { padding: 12, borderRadius: 10, marginBottom: 12 },
});
