/**
 * Saving files when the site runs inside the Android app shell (Capacitor).
 * All imports are dynamic so the browser build never pulls native code in.
 */

export function isNativeApp(): boolean {
  try {
    const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return cap?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the converted file."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Writes the 3GP into the device's Documents folder, then offers the share sheet
 * so the user can move it wherever they like. Returns a user-facing message.
 */
export async function saveToDevice(blob: Blob, fileName: string): Promise<string> {
  const [{ Filesystem, Directory }, share] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share").catch(() => null),
  ]);

  const data = await blobToBase64(blob);

  const write = async (directory: (typeof Directory)[keyof typeof Directory]) =>
    Filesystem.writeFile({ path: fileName, data, directory, recursive: true });

  let written: { uri: string };
  try {
    written = await write(Directory.Documents);
  } catch {
    written = await write(Directory.Cache);
  }

  if (share?.Share) {
    try {
      const can = await share.Share.canShare();
      if (can.value) {
        await share.Share.share({
          title: fileName,
          url: written.uri,
          dialogTitle: "Save or send your 3GP",
        });
        return `Saved ${fileName} to your Documents folder.`;
      }
    } catch {
      /* user dismissed the sheet — the file is already on disk */
    }
  }

  return `Saved ${fileName} to your Documents folder.`;
}
