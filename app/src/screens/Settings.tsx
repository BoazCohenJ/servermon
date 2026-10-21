import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Settings as S, normalizeUrl } from '../api';
import { Card, ErrorBanner } from '../components/ui';
import { useTheme } from '../theme';

export default function Settings({
  initial,
  onSave,
  error,
}: {
  initial: S;
  onSave: (s: S) => void;
  error?: string | null;
}) {
  const t = useTheme();
  const [url, setUrl] = useState(initial.baseUrl);
  const [token, setToken] = useState(initial.token);
  const input = {
    color: t.text,
    borderColor: t.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: t.bg,
  } as const;

  return (
    <View>
      {error ? <ErrorBanner message={error} /> : null}
      <Card>
        <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>Connect to your server</Text>
        <Text style={{ color: t.muted, marginTop: 4, marginBottom: 14 }}>
          Use the address of the ServerMon container, for example http://100.64.0.5:8787 over Tailscale, or an
          https:// address behind a reverse proxy.
        </Text>
        <Text style={{ color: t.muted, fontSize: 12, marginBottom: 4 }}>Server address</Text>
        <TextInput
          value={url}
          onChangeText={setUrl}
          placeholder="http://my-server:8787"
          placeholderTextColor={t.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={input}
        />
        <Text style={{ color: t.muted, fontSize: 12, marginTop: 14, marginBottom: 4 }}>Access token</Text>
        <TextInput
          value={token}
          onChangeText={setToken}
          placeholder="SERVERMON_TOKEN"
          placeholderTextColor={t.muted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={input}
        />
        <Pressable
          onPress={() => onSave({ baseUrl: normalizeUrl(url), token: token.trim() })}
          style={({ pressed }) => ({
            marginTop: 18,
            backgroundColor: t.accent,
            padding: 14,
            borderRadius: 10,
            alignItems: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Save and connect</Text>
        </Pressable>
      </Card>
      <Text style={{ color: t.muted, fontSize: 12, marginHorizontal: 4 }}>
        The token is kept in the device's secure storage. Plain http is fine on a private VPN; use https if the
        server is reachable from the internet.
      </Text>
    </View>
  );
}
