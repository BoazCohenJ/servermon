import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Card, Pill, Row, SectionTitle, Trend } from '../components/ui';
import { bytes, hoursToAge } from '../format';
import { levelColor, useTheme } from '../theme';
import { Disk, History } from '../types';

function DiskCard({ disk, history }: { disk: Disk; history: number[][] | null }) {
  const t = useTheme();
  const [open, setOpen] = useState(disk.status !== 'ok');
  const [realloc, temp] = history ?? [[], []];

  return (
    <Pressable onPress={() => setOpen((o) => !o)}>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>{disk.model}</Text>
            <Text style={{ color: t.muted, fontSize: 12, marginTop: 2 }}>
              {disk.device} · {disk.type.toUpperCase()} · {bytes(disk.capacity, 0)}
            </Text>
          </View>
          <Pill level={disk.status} />
        </View>

        {disk.reasons.map((r, i) => (
          <Text key={i} style={{ color: levelColor(t, disk.status), marginTop: 6, fontSize: 14 }}>
            • {r}
          </Text>
        ))}

        <View style={{ flexDirection: 'row', marginTop: 10, gap: 16 }}>
          <Mini label="Reallocated" value={String(disk.realloc)} bad={disk.realloc > 0} />
          <Mini label="Pending" value={String(disk.pending)} bad={disk.pending > 0} />
          <Mini label="Temp" value={disk.temp_c != null ? `${disk.temp_c}°C` : '–'} />
        </View>

        {open && (
          <View style={{ marginTop: 12 }}>
            <Text style={{ color: t.muted, fontSize: 12, marginBottom: 6 }}>Reallocated sectors (history)</Text>
            <Trend values={realloc} level={disk.realloc > 0 ? 'warn' : 'ok'} />
            <Text style={{ color: t.muted, fontSize: 12, marginTop: 12, marginBottom: 6 }}>Temperature (history)</Text>
            <Trend values={temp} />
            <View style={{ height: 10 }} />
            <Row label="SMART self-assessment" value={disk.passed == null ? 'unknown' : disk.passed ? 'PASSED' : 'FAILED'} valueColor={disk.passed === false ? t.crit : undefined} />
            <Row label="Power-on time" value={hoursToAge(disk.power_on_hours)} />
            <Row label="Uncorrectable sectors" value={String(disk.offline_uncorrect)} />
            <Row label="Interface CRC errors" value={String(disk.crc_errors)} />
            {disk.wear_pct != null && <Row label="Endurance used" value={`${disk.wear_pct}%`} />}
            {disk.spare_pct != null && <Row label="Spare capacity" value={`${disk.spare_pct}%`} />}
            {disk.media_errors != null && <Row label="Media errors" value={String(disk.media_errors)} />}
            {disk.serial && <Row label="Serial" value={disk.serial} />}
          </View>
        )}
      </Card>
    </Pressable>
  );
}

function Mini({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  const t = useTheme();
  return (
    <View>
      <Text style={{ color: t.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: bad ? t.warn : t.text, fontSize: 16, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

export default function Disks({ disks, history }: { disks: Disk[]; history: History | null }) {
  const t = useTheme();
  if (disks.length === 0) {
    return (
      <Card>
        <Text style={{ color: t.text, fontWeight: '600' }}>No disks reported</Text>
        <Text style={{ color: t.muted, marginTop: 4 }}>
          The collector could not read SMART data. Check that smartmontools is available and the container is privileged.
        </Text>
      </Card>
    );
  }
  const order = { crit: 0, warn: 1, ok: 2 } as const;
  const sorted = [...disks].sort((a, b) => order[a.status] - order[b.status]);
  return (
    <View>
      <SectionTitle>Tap a drive for details</SectionTitle>
      {sorted.map((d) => {
        const h = history?.[d.id];
        return (
          <DiskCard
            key={d.id}
            disk={d}
            history={h ? [h.map((p) => p.realloc), h.map((p) => p.temp_c ?? 0)] : null}
          />
        );
      })}
    </View>
  );
}
