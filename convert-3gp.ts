/**
 * Browser-only 3GP transcoding helpers (ffmpeg.wasm).
 * Import lazily — never at module scope of an SSR route.
 */

export type PresetId = "classic" | "standard" | "high";

export interface Preset {
  id: PresetId;
  label: string;
  detail: string;
  width: number;
  height: number;
  fps: number;
  videoBitrate: string;
  audioRate: number;
  audioBitrate: string;
}

export const PRESETS: Preset[] = [
  {
    id: "classic",
    label: "Classic 176×144",
    detail: "QCIF · 12 fps · fastest, smallest file",
    width: 176,
    height: 144,
    fps: 12,
    videoBitrate: "110k",
    audioRate: 8000,
    audioBitrate: "16k",
  },
  {
    id: "standard",
    label: "Standard 320×240",
    detail: "QVGA · 15 fps · fast, balanced size",
    width: 320,
    height: 240,
    fps: 15,
    videoBitrate: "280k",
    audioRate: 16000,
    audioBitrate: "24k",
  },
  {
    id: "high",
    label: "Sharp 640×480",
    detail: "VGA · 20 fps · best looking 3GP",
    width: 640,
    height: 480,
    fps: 20,
    videoBitrate: "650k",
    audioRate: 22050,
    audioBitrate: "32k",
  },
];

const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
const CORE_MT_BASE = "https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm";

/** Multithreaded ffmpeg needs SharedArrayBuffer, which needs cross-origin isolation. */
function canUseMultiThread(): boolean {
  try {
    return (
      typeof SharedArrayBuffer !== "undefined" &&
      typeof globalThis.crossOriginIsolated !== "undefined" &&
      globalThis.crossOriginIsolated === true
    );
  } catch {
    return false;
  }
}

/** Number of encoder threads to ask for (0 = let ffmpeg decide). */
function threadCount(): number {
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 0 : 0;
  return Math.max(1, Math.min(8, cores || 4));
}

type FFmpegInstance = import("@ffmpeg/ffmpeg").FFmpeg;

let instance: FFmpegInstance | null = null;
let loading: Promise<FFmpegInstance> | null = null;

export async function getFFmpeg(onLog?: (line: string) => void): Promise<FFmpegInstance> {
  if (instance) return instance;
  if (!loading) {
    loading = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
        import("@ffmpeg/ffmpeg"),
        import("@ffmpeg/util"),
      ]);
      const ffmpeg = new FFmpeg();
      ffmpeg.on("log", ({ message }) => onLog?.(message));

      const loadCore = async (base: string, mt: boolean) => {
        const [coreURL, wasmURL, workerURL] = await Promise.all([
          toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
          toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
          mt
            ? toBlobURL(`${base}/ffmpeg-core.worker.js`, "text/javascript")
            : Promise.resolve(undefined),
        ]);
        await ffmpeg.load(workerURL ? { coreURL, wasmURL, workerURL } : { coreURL, wasmURL });
      };

      // Multithreaded core is several times faster; fall back to single-thread.
      if (canUseMultiThread()) {
        try {
          await loadCore(CORE_MT_BASE, true);
        } catch {
          await loadCore(CORE_BASE, false);
        }
      } else {
        await loadCore(CORE_BASE, false);
      }
      instance = ffmpeg;
      return ffmpeg;
    })();
  }
  return loading;
}

/** Drop the engine so the browser can reclaim its WASM heap (needed after big files). */
export async function resetFFmpeg() {
  const current = instance;
  instance = null;
  loading = null;
  try {
    current?.terminate();
  } catch {
    /* ignore */
  }
}

export interface ConvertResult {
  blob: Blob;
  fileName: string;
}

/** ffmpeg.wasm runs in a 32-bit heap, so very big inputs simply cannot fit. */
export const MAX_INPUT_BYTES = 1_500_000_000;
const FRESH_ENGINE_BYTES = 120 * 1024 * 1024;

function friendlyError(err: unknown, file: File): Error {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (/could not be read|NotReadableError|permission/i.test(raw)) {
    return new Error(
      "The phone released access to this video while reading it. Re-pick the file (copy it into your Downloads folder first if it lives in a gallery/cloud folder) and convert again without switching apps.",
    );
  }
  const memoryish =
    /memory|allocat|abort|RuntimeError|out of bounds|Aborted|terminated|detached/i.test(raw);
  if (memoryish || !raw) {
    return new Error(
      `This file (${formatBytes(file.size)}) is too large for the in-browser converter to hold in memory. ` +
        `Try the Classic 176×144 preset, close other tabs, or split/trim the video into shorter parts and convert them one by one.`,
    );
  }
  return new Error(raw);
}

/** Read the file in slices, so Android never has to hand us one huge buffer at once. */
async function streamIntoFs(
  ffmpeg: FFmpegInstance,
  file: File,
  path: string,
  onProgress?: (ratio: number) => void,
) {
  const CHUNK = 16 * 1024 * 1024;
  const target = new Uint8Array(file.size);
  let offset = 0;
  while (offset < file.size) {
    const slice = file.slice(offset, Math.min(offset + CHUNK, file.size));
    const buf = new Uint8Array(await slice.arrayBuffer());
    target.set(buf, offset);
    offset += buf.length;
    onProgress?.(Math.min(0.15, (offset / file.size) * 0.15));
  }
  await ffmpeg.writeFile(path, target);
}


export async function convertTo3gp(
  file: File,
  preset: Preset,
  handlers: {
    onProgress?: (ratio: number) => void;
    onLog?: (line: string) => void;
  } = {},
): Promise<ConvertResult> {
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error(
      `${formatBytes(file.size)} is beyond what a browser converter can handle. Please trim the video or convert it in parts.`,
    );
  }

  const big = file.size > FRESH_ENGINE_BYTES;
  // Big jobs get a clean heap so a previous conversion can't push them over the limit.
  if (big) await resetFFmpeg();

  const ffmpeg = await getFFmpeg(handlers.onLog);

  const progressHandler = ({ progress }: { progress: number }) => {
    handlers.onProgress?.(Math.max(0, Math.min(1, progress)));
  };
  ffmpeg.on("progress", progressHandler);

  const stamp = Date.now();
  const mountPoint = `/mnt_${stamp}`;
  const outputName = `output_${stamp}.3gp`;
  let inputName = `input_${stamp}`;
  let mounted = false;

  try {
    // Prefer mounting the file: the worker reads it lazily off disk, so a 400 MB
    // video never has to fit into a JS ArrayBuffer.
    try {
      const { FFFSType } = await import("@ffmpeg/ffmpeg");
      await ffmpeg.createDir(mountPoint);
      await ffmpeg.mount(FFFSType.WORKERFS, { files: [file] }, mountPoint);
      mounted = true;
      inputName = `${mountPoint}/${file.name}`;
    } catch {
      mounted = false;
      inputName = `input_${stamp}`;
      try {
        await streamIntoFs(ffmpeg, file, inputName, handlers.onProgress);
      } catch {
        let bytesIn: Uint8Array | null = new Uint8Array(await file.arrayBuffer());
        await ffmpeg.writeFile(inputName, bytesIn);
        bytesIn = null;
      }
    }


    const threads = String(threadCount());

    await ffmpeg.exec([
      // Decode side: use every core, skip anything we don't need.
      "-threads",
      threads,
      "-thread_type",
      "frame+slice",
      "-fflags",
      "+fastseek+genpts",
      "-i",
      inputName,
      "-vsync",
      "1",
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-map_metadata",
      "-1",
      "-sn",
      "-dn",
      "-c:v",
      "mpeg4",
      // Drop frames before scaling, then scale with the cheapest kernel available.
      "-vf",
      `fps=${preset.fps}:round=near,scale=w=${preset.width}:h=${preset.height}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=neighbor`,
      "-sws_flags",
      "neighbor",
      "-pix_fmt",
      "yuv420p",
      "-b:v",
      preset.videoBitrate,
      // Speed knobs: cheapest motion search, no B-frames, no trellis, one ref.
      "-me_range",
      "4",
      "-cmp",
      "0",
      "-subcmp",
      "0",
      "-precmp",
      "0",
      "-trellis",
      "0",
      "-bf",
      "0",
      "-refs",
      "1",
      "-g",
      String(preset.fps * 4),
      "-mbd",
      "0",
      "-flags2",
      "+fast",
      "-threads",
      threads,
      "-max_muxing_queue_size",
      "1024",
      "-c:a",
      "aac",
      "-ac",
      "1",
      "-ar",
      String(preset.audioRate),
      "-b:a",
      preset.audioBitrate,
      "-af",
      "aresample=async=1000:first_pts=0",
      "-f",
      "3gp",
      outputName,
    ]);

    // Free the source inside the virtual filesystem before reading the result.
    if (!mounted) await ffmpeg.deleteFile(inputName).catch(() => {});

    const data = await ffmpeg.readFile(outputName);
    const bytes = data as Uint8Array;
    const buffer = bytes.slice().buffer as ArrayBuffer;
    const blob = new Blob([buffer], { type: "video/3gpp" });
    if (blob.size === 0) throw new Error("Conversion produced an empty file.");

    return {
      blob,
      fileName: `${file.name.replace(/\.[^./\\]+$/, "") || "video"}.3gp`,
    };
  } catch (err) {
    // A crashed engine can never be reused — throw it away.
    await resetFFmpeg();
    throw friendlyError(err, file);
  } finally {
    try {
      ffmpeg.off("progress", progressHandler);
      if (mounted) {
        await ffmpeg.unmount(mountPoint).catch(() => {});
      } else {
        await ffmpeg.deleteFile(inputName).catch(() => {});
      }
      await ffmpeg.deleteFile(outputName).catch(() => {});
    } catch {
      /* engine already gone */
    }
    if (big) await resetFFmpeg();
  }

}


export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
