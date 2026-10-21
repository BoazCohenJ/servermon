import React from 'react';
import { Text, View } from 'react-native';
import { Bar, Card, Pill, Row, SectionTitle, Stat } from '../components/ui';
import { bytes, duration, rate } from '../format';
import { levelColor, useTheme } from '../theme';
import { Level, Snapshot } from '../types';

function count(items: { status: Level }[], l: Level) {
  return items.filter((i) => i.status === l).length;
}

export default function Overview({ snap }: { snap: Snapshot }) {
  const t = useTheme();
  const sys = snap.system;
  const problems = [
    ...snap.disks.filter((d) => d.status !== 'ok').map((d) => ({ level: d.status, text: `${d.model}: ${d.reasons.join('; ')}` })),
    ...snap.filesystems.filter((f) => f.status !== 'ok').map((f) => ({ level: f.status, text: `${f.mount} is ${f.pct}% full` })),
    ...snap.services.filter((s) => s.status !== 'ok').map((s) => ({ level: s.status, text: `${s.name}: ${s.detail || s.state}` })),
  ];

  return (
    <View>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: t.text, fontSize: 20, fontWeight: '700' }}>{snap.hostname}</Text>
          <Pill level={snap.overall} />
        </View>
        <Text style={{ color: t.muted, marginTop: 4 }}>Up {duration(sys.uptime_s)}</Text>
        {problems.length > 0 && (
          <View style={{ marginTop: 10 }}>
            {problems.map((p, i) => (
              <Text key={i} style={{ color: levelColor(t, p.level), fontSize: 14, marginTop: 4 }}>
                • {p.text}
              </Text>
            ))}
          </View>
        )}
        {problems.length === 0 && <Text style={{ color: t.ok, marginTop: 8 }}>Everything looks healthy.</Text>}
        {snap.warnings.map((w, i) => (
          <Text key={i} style={{ color: t.warn, marginTop: 6, fontSize: 13 }}>
            ⚠ {w}
          </Text>
        ))}
      </Card>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Card style={{ flex: 1 }}>
          <Stat label="Disks" value={`${count(snap.disks, 'ok')}/${snap.disks.length}`} sub="healthy" />
        </Card>
        <Card style={{ flex: 1 }}>
          <Stat
            label="Services"
            value={`${count(snap.services, 'ok')}/${snap.services.length}`}
            sub="running"
          />
        </Card>
      </View>

      <SectionTitle>System</SectionTitle>
      <Card>
        <Text style={{ color: t.muted, fontSize: 12 }}>CPU · {sys.cores} cores</Text>
        <Text style={{ color: t.text, fontSize: 22, fontWeight: '700', marginVertical: 4 }}>{sys.cpu_pct}%</Text>
        <Bar pct={sys.cpu_pct} />
        <View style={{ height: 14 }} />
        <Text style={{ color: t.muted, fontSize: 12 }}>
          Memory · {bytes(sys.mem_used)} of {bytes(sys.mem_total)}
        </Text>
        <Text style={{ color: t.text, fontSize: 22, fontWeight: '700', marginVertical: 4 }}>{sys.mem_pct}%</Text>
        <Bar pct={sys.mem_pct} level={sys.mem_pct >= 90 ? 'warn' : 'ok'} />
        <View style={{ height: 10 }} />
        <Row label="Load (1/5/15 min)" value={sys.load.join(' · ')} />
        {sys.swap_total > 0 && <Row label="Swap" value={`${bytes(sys.swap_used)} / ${bytes(sys.swap_total)}`} />}
        <Row label="Network ↓ / ↑" value={`${rate(sys.net_rx_rate)} / ${rate(sys.net_tx_rate)}`} />
      </Card>

      <SectionTitle>Storage</SectionTitle>
      {snap.filesystems.map((f) => (
        <Card key={f.mount}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ color: t.text, fontWeight: '600' }}>{f.mount}</Text>
            <Text style={{ color: f.status === 'ok' ? t.muted : levelColor(t, f.status) }}>{f.pct}%</Text>
          </View>
          <Bar pct={f.pct} level={f.status} />
          <Text style={{ color: t.muted, fontSize: 12, marginTop: 6 }}>
            {bytes(f.used)} of {bytes(f.total)} · {f.device} ({f.fstype})
          </Text>
        </Card>
      ))}
    </View>
  );
}
