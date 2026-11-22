/**
 * A pixel-art window that stretches to any size (nine-slice).
 *
 *   ┌──┬────────┬──┐   corners: small images, never stretched
 *   │tl│  top   │tr│   edges:   strips of solid colour, one view per art pixel
 *   ├──┼────────┼──┤   middle:  one view with the fill colour
 *   │  │ middle │  │
 *   ├──┼────────┼──┤   Only the corners are images, so nothing is ever scaled
 *   │bl│ bottom │br│   and the pixels stay sharp at any size.
 *   └──┴────────┴──┘
 */
import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { FRAMES, FrameName } from './assets.generated';
import { PIXEL } from './theme';

interface FrameProps {
  name: FrameName;
  style?: StyleProp<ViewStyle>;
  /** Extra space between the frame and the content, in dp. */
  padding?: number;
  children?: React.ReactNode;
}

/**
 * A strip of solid colours, one per art pixel, across the thickness of an edge.
 * Flexbox stretches each cell along the edge, so the strip grows with the frame.
 */
function Strip({ colours, direction }: { colours: (string | null)[]; direction: 'row' | 'column' }) {
  const cell = direction === 'column' ? { height: PIXEL } : { width: PIXEL };
  return (
    <View style={{ flexDirection: direction, flex: 1 }}>
      {colours.map((colour, i) => (
        <View key={i} style={[cell, colour ? { backgroundColor: colour } : null]} />
      ))}
    </View>
  );
}

export function Frame({ name, style, padding = 0, children }: FrameProps) {
  const art = FRAMES[name];
  const side = art.side * PIXEL;
  const bottom = art.bottom * PIXEL;
  const corner = (height: number) => ({ width: side, height });

  return (
    <View style={style}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {/* middle */}
        <View style={{ position: 'absolute', left: side, right: side, top: side, bottom, backgroundColor: art.fill }} />
        {/* edges */}
        <View style={{ position: 'absolute', left: side, right: side, top: 0, height: side }}>
          <Strip colours={art.top} direction="column" />
        </View>
        <View style={{ position: 'absolute', left: side, right: side, bottom: 0, height: bottom }}>
          <Strip colours={art.bottomEdge} direction="column" />
        </View>
        <View style={{ position: 'absolute', left: 0, width: side, top: side, bottom }}>
          <Strip colours={art.left} direction="row" />
        </View>
        <View style={{ position: 'absolute', right: 0, width: side, top: side, bottom }}>
          <Strip colours={art.right} direction="row" />
        </View>
        {/* corners */}
        <Image source={art.corners.tl} style={[styles.abs, corner(side), { left: 0, top: 0 }]} />
        <Image source={art.corners.tr} style={[styles.abs, corner(side), { right: 0, top: 0 }]} />
        <Image source={art.corners.bl} style={[styles.abs, corner(bottom), { left: 0, bottom: 0 }]} />
        <Image source={art.corners.br} style={[styles.abs, corner(bottom), { right: 0, bottom: 0 }]} />
      </View>
      <View style={{ paddingTop: side + padding, paddingBottom: bottom + padding, paddingHorizontal: side + padding }}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
});
