/**
 * Bridge to the native Android FFmpeg plugin.
 *
 * When the site runs inside the Android app shell, conversion happens with the
 * phone's native FFmpeg binaries (much faster than the WebAssembly engine).
 * In a normal browser every function here reports "unavailable" and the web
 * converter is used instead.
 */

export interface NativePickedFile {
  uri: string;
  name: string;
  size: number;
}

export interface NativeConvertResult {
  path: string;
  name: string;
  size: number;
}

interface NativeFfmpegPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  pickVideo(): Promise<NativePickedFile>;
  convert(options: {
    uri: string;
    fileName: string;
    width: number;
    height: number;
    fps: number;
    videoBitrate: string;
    audioRate: number;
    audioBitrate: string;
  }): Promise<NativeConvertResult>;
  exportToDownloads(options: { path: string }): Promise<{ uri: string; folder: string }>;
  addListener(
    event: "progress",
    cb: (data: { ratio: number; speed: number }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    event: "log",
    cb: (data: { line: string }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

let pluginPromise: Promise<NativeFfmpegPlugin | null> | null = null;

function isNativePlatform(): boolean {
  try {
    const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return cap?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

async function getPlugin(): Promise<NativeFfmpegPlugin | null> {
  if (!isNativePlatform()) return null;
  if (!pluginPromise) {
    pluginPromise = (async () => {
      try {
        const { registerPlugin } = await import("@capacitor/core");
        const plugin = registerPlugin<NativeFfmpegPlugin>("NativeFfmpeg");
        const { available } = await plugin.isAvailable();
        return available ? plugin : null;
      } catch {
        return null;
      }
    })();
  }
  return pluginPromise;
}

/** True only inside the Android app when the native FFmpeg engine is usable. */
export async function hasNativeEngine(): Promise<boolean> {
  return (await getPlugin()) !== null;
}

/** Opens Android's own video picker; returns null when the user backs out. */
export async function pickVideoNative(): Promise<NativePickedFile | null> {
  const plugin = await getPlugin();
  if (!plugin) return null;
  try {
    return await plugin.pickVideo();
  } catch {
    return null;
  }
}

export async function convertNative(
  picked: NativePickedFile,
  preset: {
    width: number;
    height: number;
    fps: number;
    videoBitrate: string;
    audioRate: number;
    audioBitrate: string;
  },
  handlers: { onProgress?: (ratio: number) => void; onLog?: (line: string) => void } = {},
): Promise<NativeConvertResult> {
  const plugin = await getPlugin();
  if (!plugin) throw new Error("The native converter is not available on this device.");

  const listeners = await Promise.all([
    plugin.addListener("progress", ({ ratio }) => handlers.onProgress?.(ratio)),
    plugin.addListener("log", ({ line }) => {
      if (line) handlers.onLog?.(line);
    }),
  ]);

  const fileName = `${picked.name.replace(/\.[^./\\]+$/, "") || "video"}.3gp`;

  try {
    return await plugin.convert({ uri: picked.uri, fileName, ...preset });
  } finally {
    await Promise.all(listeners.map((l) => l.remove().catch(() => {})));
  }
}

/** Copies the finished file into the phone's Movies folder. Returns a message for the user. */
export async function saveNativeOutput(path: string): Promise<string> {
  const plugin = await getPlugin();
  if (!plugin) throw new Error("The native converter is not available on this device.");
  const { folder } = await plugin.exportToDownloads({ path });
  return `Saved to your ${folder} folder.`;
}
