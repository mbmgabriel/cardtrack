import { File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';

/**
 * Write `content` to a file in the app's cache and open the share sheet so the user can save it
 * to Files, mail it, etc. Returns false when this device can't share files.
 */
export async function shareTextFile(
  fileName: string,
  content: string,
  { mimeType, UTI }: { mimeType: string; UTI: string },
): Promise<boolean> {
  if (!(await isAvailableAsync())) return false;
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(content);
  await shareAsync(file.uri, { mimeType, UTI, dialogTitle: fileName });
  return true;
}
