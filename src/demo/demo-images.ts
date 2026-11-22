/**
 * The placeholder images of the demo (made by tools/demo_images.py), bundled with the
 * app. The bundler needs each require() written out, so they are listed by hand; a test
 * checks the list against the files the demo data uses.
 */
import { ImageSourcePropType } from 'react-native';

export const DEMO_IMAGES: Record<string, ImageSourcePropType> = {
  'photo-arrival.png': require('../../assets/demo/photo-arrival.png'),
  'photo-empty.png': require('../../assets/demo/photo-empty.png'),
  'photo-loaded.png': require('../../assets/demo/photo-loaded.png'),
  'photo-closed.png': require('../../assets/demo/photo-closed.png'),
  'photo-seal.png': require('../../assets/demo/photo-seal.png'),
  'photo-reefer-display.png': require('../../assets/demo/photo-reefer-display.png'),
  'signature-sam.png': require('../../assets/demo/signature-sam.png'),
  'signature-kim.png': require('../../assets/demo/signature-kim.png'),
  'signature-robin.png': require('../../assets/demo/signature-robin.png'),
  'signature-driver-1.png': require('../../assets/demo/signature-driver-1.png'),
  'signature-driver-2.png': require('../../assets/demo/signature-driver-2.png'),
  'signature-driver-3.png': require('../../assets/demo/signature-driver-3.png'),
};
