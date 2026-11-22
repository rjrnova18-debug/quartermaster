import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { checkSignInForm, isServerConfigured, SignInProblem } from '@/data/remote';
import { MessageKey } from '@/i18n';
import { useSession, useT } from '@/session';
import { Frame } from '@/ui/Frame';
import { Notice, PixelButton, Screen, Sprite, TextButton, TextField, TextInputHandle, Txt } from '@/ui/controls';
import { colors, space } from '@/ui/theme';

/** Where each problem is shown: next to its field, or above the button. */
const PLACE: Record<SignInProblem, 'email' | 'password' | 'form'> = {
  emailMissing: 'email',
  emailInvalid: 'email',
  passwordMissing: 'password',
  wrongCredentials: 'password',
  tooManyTries: 'form',
  offline: 'form',
  noProfile: 'form',
  unknown: 'form',
};

/** Sign in (UI-BRIEF §3): email, password with "show", one button, and the demo. */
export default function SignInScreen() {
  const { signIn, online } = useSession();
  const tr = useT();
  const passwordRef = useRef<TextInputHandle>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [problem, setProblem] = useState<SignInProblem | null>(null);
  const [busy, setBusy] = useState(false);
  const configured = isServerConfigured();

  const errorFor = (place: 'email' | 'password' | 'form') =>
    problem && PLACE[problem] === place ? tr(`error.${problem}` as MessageKey) : null;

  async function submit() {
    const formProblem = checkSignInForm(email, password);
    setProblem(formProblem);
    if (formProblem || busy) {
      return;
    }
    setBusy(true);
    try {
      setProblem(await signIn(email, password));
    } catch {
      setProblem('unknown');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Sprite name="yardScene" />
      <View style={styles.heading}>
        <Txt variant="title" accessibilityRole="header">
          {tr('app.name')}
        </Txt>
        <Txt color={colors.textMuted}>{tr('app.tagline')}</Txt>
      </View>

      {configured ? (
        <Frame name="panel" padding={space.s}>
          <View style={styles.form}>
            <Txt variant="heading">{tr('signIn.title')}</Txt>
            {!online ? <Notice text={tr('signIn.offline')} /> : null}
            <TextField
              label={tr('signIn.email')}
              value={email}
              onChangeText={setEmail}
              error={errorFor('email')}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="username"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              submitBehavior="submit"
            />
            <TextField
              ref={passwordRef}
              label={tr('signIn.password')}
              value={password}
              onChangeText={setPassword}
              error={errorFor('password')}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={submit}
              accessory={
                <TextButton
                  label={showPassword ? tr('signIn.hide') : tr('signIn.show')}
                  onPress={() => setShowPassword((shown) => !shown)}
                />
              }
            />
            {errorFor('form') ? (
              <Txt variant="small" color={colors.error} accessibilityLiveRegion="polite">
                {errorFor('form')}
              </Txt>
            ) : null}
            <PixelButton label={tr('signIn.submit')} busyLabel={tr('signIn.busy')} busy={busy} onPress={submit} />
          </View>
        </Frame>
      ) : (
        <Notice text={tr('signIn.noServer')} />
      )}

      <PixelButton variant="secondary" label={tr('signIn.tryDemo')} onPress={() => router.push('/demo')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { alignItems: 'center', gap: space.xs },
  form: { gap: space.m },
});
