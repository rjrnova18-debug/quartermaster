/**
 * The building blocks every screen uses: text, buttons, fields, notices, sprites and
 * the screen itself. They follow the rules of UI-BRIEF §2: a pixel face only for short
 * words, touch targets of at least 48 dp, and colour never as the only signal.
 */
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { FRAMES, SPRITES } from './assets.generated';
import { Frame } from './Frame';
import { colors, fonts, PIXEL, space, TOUCH_TARGET } from './theme';

// ---------------------------------------------------------------- text

type TextVariant = 'title' | 'heading' | 'label' | 'body' | 'small';

const textStyles: Record<TextVariant, TextStyle> = {
  title: { fontFamily: fonts.pixel, fontSize: 32, lineHeight: 40 },
  heading: { fontFamily: fonts.pixel, fontSize: 22, lineHeight: 30 },
  label: { fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fonts.body, fontSize: 17, lineHeight: 25 },
  small: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21 },
};

export function Txt({
  variant = 'body',
  color = colors.text,
  style,
  children,
  ...rest
}: { variant?: TextVariant; color?: string; style?: StyleProp<TextStyle>; children: React.ReactNode } & Omit<
  React.ComponentProps<typeof Text>,
  'style'
>) {
  return (
    <Text style={[textStyles[variant], { color }, style]} {...rest}>
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------- button

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  /** Shown instead of the label while the action runs; the button is disabled meanwhile. */
  busyLabel?: string;
  busy?: boolean;
  hint?: string;
  style?: StyleProp<ViewStyle>;
}

/** A framed button that sinks by its depth while it is pressed. */
export function PixelButton({ label, onPress, variant = 'primary', busyLabel, busy = false, hint, style }: ButtonProps) {
  const up = variant === 'primary' ? 'btnOrange' : 'btnPaper';
  const down = variant === 'primary' ? 'btnOrangePressed' : 'btnPaperPressed';
  const sink = (FRAMES[up].bottom - FRAMES[down].bottom) * PIXEL;

  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ busy, disabled: busy }}
      style={style}
    >
      {({ pressed }) => (
        <View style={{ paddingTop: pressed ? sink : 0 }}>
          <Frame name={pressed ? down : up} style={{ minHeight: TOUCH_TARGET - (pressed ? sink : 0) }}>
            <View style={styles.buttonInner}>
              <Txt variant="heading" color={colors.textOnAccent} style={styles.buttonText}>
                {busy && busyLabel ? busyLabel : label}
              </Txt>
            </View>
          </Frame>
        </View>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------- field

/** What a ref to a text input points at (used to move the focus). */
export type TextInputHandle = React.ComponentRef<typeof TextInput>;

interface FieldProps extends TextInputProps {
  ref?: React.Ref<TextInputHandle>;
  label: string;
  /** In words, under the field; also turns the frame red. */
  error?: string | null;
  /** Red frame without a message (the message is shown elsewhere). */
  invalid?: boolean;
  /** The label is only read by screen readers (it is already shown above the field). */
  hideLabel?: boolean;
  /** Something next to the input, like a show/hide button. */
  accessory?: React.ReactNode;
}

export function TextField({ ref, label, error, invalid = false, hideLabel = false, accessory, ...input }: FieldProps) {
  return (
    <View style={styles.field}>
      {hideLabel ? null : <Txt variant="label">{label}</Txt>}
      <Frame name={error || invalid ? 'fieldFail' : 'field'}>
        <View style={styles.fieldRow}>
          <TextInput
            ref={ref}
            accessibilityLabel={label}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            {...input}
          />
          {accessory}
        </View>
      </Frame>
      {error ? (
        <Txt variant="small" color={colors.error} accessibilityLiveRegion="polite">
          {error}
        </Txt>
      ) : null}
    </View>
  );
}

/** A small text button, like "Show" next to the password. */
export function TextButton({ label, onPress, hint }: { label: string; onPress: () => void; hint?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityHint={hint} hitSlop={8} style={styles.textButton}>
      <Txt variant="label" style={styles.underline}>
        {label}
      </Txt>
    </Pressable>
  );
}

// ---------------------------------------------------------------- notice, marker, sprite

/** A short message in a card, for offline and similar states. */
export function Notice({ text }: { text: string }) {
  return (
    <Frame name="card" padding={space.xs} style={styles.notice}>
      <Txt variant="small" accessibilityLiveRegion="polite">
        {text}
      </Txt>
    </Frame>
  );
}

/** The persistent "Demo" tag of UI-BRIEF §3. */
export function DemoMarker({ label }: { label: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="none" style={[styles.marker, { top: insets.top + space.xs }]} accessibilityLabel={label}>
      <Txt variant="label" style={styles.markerText}>
        {label}
      </Txt>
    </View>
  );
}

/** A whole sprite at its exact pixel size, so it is never smoothed. */
export function Sprite({ name }: { name: keyof typeof SPRITES }) {
  const sprite = SPRITES[name];
  return (
    <View style={styles.spriteBox} accessible={false}>
      <Image source={sprite.source} style={{ width: sprite.width * PIXEL, height: sprite.height * PIXEL }} />
    </View>
  );
}

// ---------------------------------------------------------------- screen

/** Safe area, paper background, scrolling, and room for the keyboard. */
export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.m, gap: space.m, flexGrow: 1 },
  buttonInner: { minHeight: TOUCH_TARGET - 16, justifyContent: 'center', paddingHorizontal: space.s },
  buttonText: { textAlign: 'center' },
  field: { gap: space.xs },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  input: {
    flex: 1,
    minHeight: TOUCH_TARGET - 12,
    fontFamily: fonts.body,
    fontSize: 17,
    color: colors.text,
    paddingVertical: 0,
  },
  textButton: { minHeight: TOUCH_TARGET - 12, justifyContent: 'center', paddingHorizontal: space.xs },
  underline: { textDecorationLine: 'underline' },
  notice: { alignSelf: 'stretch' },
  marker: {
    position: 'absolute',
    right: space.m,
    backgroundColor: colors.demoMarker,
    borderColor: colors.text,
    borderWidth: PIXEL,
    paddingHorizontal: space.s,
    zIndex: 10,
  },
  markerText: { letterSpacing: 1 },
  spriteBox: { alignItems: 'center', overflow: 'hidden' },
});
