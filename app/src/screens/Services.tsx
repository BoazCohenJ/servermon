import React from 'react';
import { Text, View } from 'react-native';
import { Card, Pill, SectionTitle } from '../components/ui';
import { useTheme } from '../theme';
import { Service } from '../types';

function Group({ title, items }: { title: string; items: Service[] }) {
  const t = useTheme();
  if (items.length === 0) return null;
  const order = { crit: 0, warn: 1, ok: 2 } as const;
  const sorted = [...items].sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
  return (
    <View>
      <SectionTitle>{title}</SectionTitle>
      {sorted.map((s) => (
        <Card key={`${s.kind}:${s.name}`} style={{ paddingVertical: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>{s.name}</Text>
              <Text style={{ color: t.muted, fontSize: 12, marginTop: 2 }}>
                {s.detail || s.state}
                {s.image ? ` · ${s.image}` : ''}
              </Text>
            </View>
            <Pill level={s.status} label={s.state} />
          </View>
        </Card>
      ))}
    </View>
  );
}

export default function Services({ services }: { services: Service[] }) {
  const t = useTheme();
  if (services.length === 0) {
    return (
      <Card>
        <Text style={{ color: t.text, fontWeight: '600' }}>Nothing to show</Text>
        <Text style={{ color: t.muted, marginTop: 4 }}>
          Add systemd units to "services" in the server config, and mount the Docker socket to see containers.
        </Text>
      </Card>
    );
  }
  return (
    <View>
      <Group title="Docker containers" items={services.filter((s) => s.kind === 'docker')} />
      <Group title="systemd services" items={services.filter((s) => s.kind === 'systemd')} />
    </View>
  );
}
