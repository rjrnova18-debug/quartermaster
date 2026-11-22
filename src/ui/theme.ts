/**
 * Design tokens: the 32-colour palette "yard at dawn" (UI-BRIEF §11, D1), the two
 * typefaces (D2) and the size of one art pixel. Components use the names in `colors`,
 * never raw hex values, so a colour changes in one place.
 */

/** One pixel of the artwork is drawn as 2 × 2 dp. Every frame and sprite follows it. */
export const PIXEL = 2;

export const palette = {
  ink: '#1F1A2B',
  inkSoft: '#4A4257',
  metalShadow: '#6A6178',
  metalDark: '#8B8398',
  metal: '#ABA3B6',
  metalLight: '#C9C1CF',
  paperShade: '#E9DDC0',
  paper: '#F6EEDB',
  paperLight: '#FFFAEE',
  dawn: '#FFD9A0',
  orangeDark: '#A8471A',
  orangeMid: '#C95F22',
  orange: '#EE7B2C',
  orangeLight: '#FFB36B',
  passDark: '#24663A',
  pass: '#3E9A52',
  passLight: '#A6D98F',
  failDark: '#922434',
  fail: '#D53D3D',
  failLight: '#F4A592',
  slateDark: '#3D5470',
  slateMid: '#4E6A8C',
  slate: '#6283A6',
  slateLight: '#8AA7C4',
  slatePale: '#B3CBE0',
  amberDark: '#8A6410',
  amber: '#F1C232',
  coldDark: '#1F6F78',
  cold: '#43B9C4',
  sky: '#86D4DB',
  coldPale: '#C3EEF0',
  glass: '#DDEAF3',
} as const;

/** What each colour is for. Text only ever uses ink or a dark tone (all pairs meet AA). */
export const colors = {
  background: palette.paper,
  text: palette.ink,
  textMuted: palette.inkSoft,
  textOnAccent: palette.ink,
  error: palette.failDark,
  warningText: palette.amberDark,
  demoMarker: palette.amber,
  /** Darkens the screen behind a panel: ink at 55 %. */
  scrim: `${palette.ink}8C`,
} as const;

export const fonts = {
  /** DotGothic16: titles, buttons, numbers, stamps. Never for long text. */
  pixel: 'DotGothic16_400Regular',
  /** Atkinson Hyperlegible: questions, notes, anything longer than a few words. */
  body: 'AtkinsonHyperlegible_400Regular',
  bodyBold: 'AtkinsonHyperlegible_700Bold',
} as const;

export const space = { xs: 4, s: 8, m: 16, l: 24, xl: 32 } as const;

/** The smallest thing a gloved thumb can hit (UI-BRIEF §2). */
export const TOUCH_TARGET = 48;
