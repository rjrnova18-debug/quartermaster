/**
 * Photos and signatures as files in the app's own folder (OFFLINE-SYNC.md §6).
 *
 *   <documents>/attachments/<inspection id>/<attachment id>.jpg | .png
 *   <documents>/signature/mine.png           the person's saved signature
 *
 * The database keeps only the path. Signing out or leaving the demo deletes all of it.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { ImageSourcePropType } from 'react-native';

import { DEMO_IMAGES } from '@/demo/demo-images';

/** Photos are stored with their longest side at most this many pixels. */
export const LONGEST_SIDE = 1600;

function folder(...parts: string[]): Directory {
  const directory = new Directory(Paths.document, ...parts);
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

/** Resizes a picked photo, saves it as JPEG in the inspection's folder and returns its path. */
export async function storePhoto(
  source: { uri: string; width: number; height: number },
  inspectionId: string,
  attachmentId: string,
): Promise<string> {
  const context = ImageManipulator.manipulate(source.uri);
  if (Math.max(source.width, source.height) > LONGEST_SIDE) {
    context.resize(source.width >= source.height ? { width: LONGEST_SIDE } : { height: LONGEST_SIDE });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  const target = new File(folder('attachments', inspectionId), `${attachmentId}.jpg`);
  new File(saved.uri).move(target); // from the temporary cache into the app's folder
  return target.uri;
}

/** Writes a signature PNG in the inspection's folder and returns its path. */
export function storeSignature(png: Uint8Array, inspectionId: string, attachmentId: string): string {
  const target = new File(folder('attachments', inspectionId), `${attachmentId}.png`);
  target.write(png);
  return target.uri;
}

const savedSignature = () => new File(Paths.document, 'signature', 'mine.png');

export function hasSavedSignature(): boolean {
  return savedSignature().exists;
}

export function keepAsSavedSignature(png: Uint8Array) {
  folder('signature');
  savedSignature().write(png);
}

export async function readSavedSignature(): Promise<Uint8Array> {
  return savedSignature().bytes();
}

/** Deletes one stored file. Bundled demo images are not files and are left alone. */
export function deleteFile(uri: string | null) {
  if (!uri || uri.startsWith('demo:')) return;
  const file = new File(uri);
  if (file.exists) file.delete();
}

/** Everything the app stored: on sign-out and when leaving the demo. */
export function deleteAllFiles() {
  for (const name of ['attachments', 'signature']) {
    const directory = new Directory(Paths.document, name);
    if (directory.exists) directory.delete();
  }
}

/** What an <Image> shows for a stored path: a bundled demo image or a file. */
export function imageSource(uri: string): ImageSourcePropType {
  return uri.startsWith('demo:') ? DEMO_IMAGES[uri.slice('demo:'.length)] : { uri };
}
