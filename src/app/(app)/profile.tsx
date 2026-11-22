import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, Image, StyleSheet, View } from 'react-native';

import { deleteSavedSignature, hasSavedSignature, keepAsSavedSignature, savedSignatureUri } from '@/data/files';
import { getLocal } from '@/data/local';
import { useInspections } from '@/home/useInspections';
import { displayCode } from '@/inspection/review';
import { OutboxOp } from '@/inspection/sync';
import { useSync } from '@/sync';
import { SignaturePad } from '@/form/SignaturePad';
import { SIGNATURE_HEIGHT, SIGNATURE_WIDTH } from '@/form/signature';
import { catalog } from '@/inspection/catalog';
import { useSession, useT } from '@/session';
import { Frame } from '@/ui/Frame';
import { PixelButton, Screen, TextButton, Txt } from '@/ui/controls';
import { colors, space } from '@/ui/theme';

/**
 * Profile (UI-BRIEF §8): name and role, language, the saved signature, versions and the
 * way out. The sync state and "Sync now" join it with the sender (F3f).
 */
export default function ProfileScreen() {
  const { state, locale, setLocale, signOut } = useSession();
  const tr = useT();
  const [signing, setSigning] = useState(false);
  const [version, setVersion] = useState(0); // bumped when the signature changes, to show the new one
  const sync = useSync();
  const list = useInspections();
  if (state.status !== 'signedIn') return null;
  const { profile, demo } = state;
  const saved = hasSavedSignature();

  /** Signing out erases the phone; unsent changes would be lost, so ask first (ACCESS.md §1). */
  function confirmSignOut() {
    if (demo || list.unsent === 0) {
      void signOut();
      return;
    }
    Alert.alert(tr('signOut.title'), tr('signOut.unsent', { count: list.unsent }), [
      { text: tr('common.cancel'), style: 'cancel' },
      { text: tr('home.signOut'), style: 'destructive', onPress: () => void signOut() },
    ]);
  }

  /** S8 "not allowed": drop the local changes; the next pull brings the server's copy back. */
  async function discard(op: OutboxOp) {
    const store = await getLocal();
    await store.discardChanges(op.parentId ?? op.entityId);
    await store.setMeta('last_pull_at', '');
    await sync.syncNow();
  }

  const messageOf = (op: OutboxOp) =>
    op.error === 'duplicate_trip_ref' ? tr('sync.duplicate') : op.error === 'not_allowed' ? tr('sync.notAllowed') : tr('sync.failedWith', { error: op.error ?? '' });

  return (
    <Screen>
      <Txt variant="heading" accessibilityRole="header">
        {tr('profile.title')}
      </Txt>
      <Txt variant="label">{profile.fullName}</Txt>
      <Txt color={colors.textMuted}>{tr(`role.${profile.role}`)}</Txt>

      <Txt variant="label">{tr('profile.language')}</Txt>
      <View style={styles.row} accessibilityRole="radiogroup">
        <PixelButton variant={locale === 'en' ? 'primary' : 'secondary'} label="English" onPress={() => setLocale('en')} style={styles.flex} />
        <PixelButton variant={locale === 'es' ? 'primary' : 'secondary'} label="Español" onPress={() => setLocale('es')} style={styles.flex} />
      </View>

      <Txt variant="label">{tr('profile.signature')}</Txt>
      <Txt variant="small" color={colors.textMuted}>
        {tr('profile.signatureHint')}
      </Txt>
      {saved ? (
        <Frame name="card">
          <Image key={version} source={{ uri: savedSignatureUri() }} style={styles.signature} resizeMode="contain" />
        </Frame>
      ) : (
        <Txt color={colors.textMuted}>{tr('profile.noSignature')}</Txt>
      )}
      <View style={styles.row}>
        <TextButton label={tr('profile.draw')} onPress={() => setSigning(true)} />
        {saved ? (
          <TextButton
            label={tr('profile.remove')}
            onPress={() => {
              deleteSavedSignature();
              setVersion((v) => v + 1);
            }}
          />
        ) : null}
      </View>
      {signing ? (
        <SignaturePad
          title={tr('profile.signature')}
          tr={tr}
          canUseSaved={false}
          offerKeep={false}
          onCancel={() => setSigning(false)}
          onUseSaved={() => setSigning(false)}
          onDone={(png) => {
            keepAsSavedSignature(png);
            setSigning(false);
            setVersion((v) => v + 1);
          }}
        />
      ) : null}

      {sync.live ? (
        <>
          <Txt variant="label">{tr('sync.title')}</Txt>
          <Txt variant="small" color={list.attention.length > 0 ? colors.error : colors.textMuted}>
            {list.syncLine.kind === 'synced'
              ? tr('sync.allSynced')
              : tr(list.syncLine.kind === 'waiting' ? 'sync.waiting' : 'sync.attention', { count: list.syncLine.count })}
          </Txt>
          {sync.lastError ? <Txt variant="small" color={colors.error}>{tr('sync.error', { error: sync.lastError })}</Txt> : null}
          <PixelButton
            variant="secondary"
            label={tr('sync.now')}
            busyLabel={tr('sync.running')}
            busy={sync.syncing}
            onPress={() => void sync.syncNow()}
          />
          {list.attention.map((op) => (
            <Frame key={`${op.entity}-${op.entityId}`} name="card" padding={space.xs}>
              <Txt variant="label">{displayCode(op.parentId ?? op.entityId)}</Txt>
              <Txt variant="small">{messageOf(op)}</Txt>
              {op.error === 'not_allowed' ? <TextButton label={tr('sync.discard')} onPress={() => void discard(op)} /> : null}
            </Frame>
          ))}
        </>
      ) : null}

      <Txt variant="small" color={colors.textMuted}>
        {tr('profile.versions', { app: Constants.expoConfig?.version ?? '?', form: catalog.version })}
      </Txt>
      <View style={styles.spacer} />
      <PixelButton variant="secondary" label={demo ? tr('home.leaveDemo') : tr('home.signOut')} onPress={confirmSignOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  flex: { flex: 1 },
  signature: { width: '100%', aspectRatio: SIGNATURE_WIDTH / SIGNATURE_HEIGHT },
  spacer: { flex: 1 },
});
