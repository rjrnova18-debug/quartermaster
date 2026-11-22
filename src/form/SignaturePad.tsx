/**
 * A full-screen pad to sign with a finger (UI-BRIEF §5): "Clear" and "Done", and for the
 * inspector's own signature "Use my saved signature" and "Keep it as my saved signature".
 *
 * PanResponder (part of React Native) reports where the finger is; the strokes are drawn
 * with SVG while signing and turned into a PNG by signature.ts when the person is done.
 */
import { useState } from 'react';
import { Modal, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Polyline } from 'react-native-svg';

import { MessageKey } from '@/i18n';
import { Frame } from '@/ui/Frame';
import { PixelButton, Txt } from '@/ui/controls';
import { colors, palette, space, TOUCH_TARGET } from '@/ui/theme';

import { isBlank, SIGNATURE_HEIGHT, SIGNATURE_WIDTH, signaturePng, Stroke } from './signature';

/** Pen colour: the dark slate of the palette, like ink from a ballpoint. */
export const INK = palette.slateDark;

interface Props {
  title: string;
  tr: (key: MessageKey) => string;
  /** Offered only for the inspector's own signature. */
  canUseSaved: boolean;
  offerKeep: boolean;
  onDone: (png: Uint8Array, keepAsMine: boolean) => void;
  onUseSaved: () => void;
  onCancel: () => void;
}

export function SignaturePad({ title, tr, canUseSaved, offerKeep, onDone, onUseSaved, onCancel }: Props) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [width, setWidth] = useState(0);
  const [keep, setKeep] = useState(false);

  // Created once, on the first render (a lazy initial state), and kept for the pad's life.
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        const { locationX: x, locationY: y } = event.nativeEvent;
        setStrokes((current) => [...current, [{ x, y }]]);
      },
      onPanResponderMove: (event) => {
        const { locationX: x, locationY: y } = event.nativeEvent;
        setStrokes((current) => {
          const last = current[current.length - 1] ?? [];
          return [...current.slice(0, -1), [...last, { x, y }]];
        });
      },
    }),
  );

  const height = (width * SIGNATURE_HEIGHT) / SIGNATURE_WIDTH;

  return (
    <Modal animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView style={styles.screen}>
        <Txt variant="heading" accessibilityRole="header">
          {title}
        </Txt>
        <Txt>{tr('media.signHere')}</Txt>

        <Frame name="field">
          <View
            style={{ height: height || 160 }}
            onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
            accessibilityLabel={tr('media.signHere')}
            {...responder.panHandlers}
          >
            <Svg width="100%" height="100%" pointerEvents="none">
              {strokes.map((stroke, i) => (
                <Polyline
                  key={i}
                  points={stroke.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={INK}
                  strokeWidth={(4 * width) / SIGNATURE_WIDTH}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </Svg>
          </View>
        </Frame>

        {offerKeep ? (
          <Pressable
            onPress={() => setKeep((k) => !k)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: keep }}
            style={styles.check}
          >
            <Txt variant="label">{`${keep ? '☑' : '☐'}  ${tr('media.keepAsMine')}`}</Txt>
          </Pressable>
        ) : null}

        <View style={styles.row}>
          <PixelButton variant="secondary" label={tr('media.clear')} onPress={() => setStrokes([])} style={styles.flex} />
          <PixelButton
            label={tr('media.done')}
            onPress={() => {
              if (!isBlank(strokes) && width > 0) onDone(signaturePng(strokes, width, INK), keep);
            }}
            style={styles.flex}
          />
        </View>
        {canUseSaved ? <PixelButton variant="secondary" label={tr('media.useSaved')} onPress={onUseSaved} /> : null}
        <PixelButton variant="secondary" label={tr('media.cancel')} onPress={onCancel} />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: space.m, gap: space.m },
  row: { flexDirection: 'row', gap: space.s },
  flex: { flex: 1 },
  check: { minHeight: TOUCH_TARGET, justifyContent: 'center' },
});
