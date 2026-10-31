/**
 * Custom card artwork (a Pro feature): pictures the user picks as a card's background. They're
 * copied into the app's documents folder and stay on the device; the database keeps the path
 * relative to that folder, because the folder's absolute location can change between app updates.
 *
 * Artwork only — never a photo of a real card, which would show its full number (PLAN.md §3.3).
 */
import { Directory, File, Paths } from 'expo-file-system';
import { launchImageLibraryAsync } from 'expo-image-picker';

const FOLDER = 'card-art';

/** The image's URI for display, or null when there's none (or the file is gone, e.g. after a restore). */
export function cardArtUri(path: string | null | undefined): string | null {
  if (!path) return null;
  const file = new File(Paths.document, path);
  return file.exists ? file.uri : null;
}

/** Let the user pick a picture and keep a copy for this account. Null if they cancel. */
export async function pickCardArt(accountId: string): Promise<string | null> {
  const result = await launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
  const picked = result.canceled ? undefined : result.assets[0];
  if (!picked) return null;
  const folder = new Directory(Paths.document, FOLDER);
  if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  const source = new File(picked.uri);
  // A new name each time, so an image cached under the old name is never shown by mistake.
  const name = `${accountId}-${Date.now()}${source.extension || '.jpg'}`;
  await source.copy(new File(folder, name));
  return `${FOLDER}/${name}`;
}

/** Remove a stored picture (when it's replaced or removed, or its account is deleted). */
export function deleteCardArt(path: string | null | undefined): void {
  if (!path) return;
  const file = new File(Paths.document, path);
  if (file.exists) file.delete();
}
