const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  pdf: 'application/pdf',
};

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
  'image/tiff': 'tiff',
  'application/pdf': 'pdf',
};

export function inferMimeTypeFromFilename(filename: string): string {
  const clean = filename.split(/[?#]/)[0] ?? filename;
  const dotIdx = clean.lastIndexOf('.');
  if (dotIdx === -1) return 'application/octet-stream';
  const ext = clean.slice(dotIdx + 1).toLowerCase();
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

export function extensionForMimeType(mimeType: string, fallback = 'bin'): string {
  return EXT_BY_MIME[mimeType.toLowerCase()] ?? fallback;
}

export function isPdfFile(file: File | Blob, filename?: string): boolean {
  if (file.type && file.type.toLowerCase() === 'application/pdf') return true;
  const candidateName =
    filename ?? (typeof File !== 'undefined' && file instanceof File ? file.name : '');
  return candidateName.toLowerCase().endsWith('.pdf');
}

export function sanitizeAssetFilename(name: string, fallbackExt = 'jpg'): string {
  const base =
    name
      .replace(/\\/g, '/')
      .split('/')
      .pop()
      ?.replace(/\.\./g, '') ?? 'asset';
  const dotIdx = base.lastIndexOf('.');
  const rawStem = dotIdx > 0 ? base.slice(0, dotIdx) : base;
  const rawExt = dotIdx > 0 ? base.slice(dotIdx + 1) : fallbackExt;

  const safeStem =
    rawStem
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'asset';
  const safeExt =
    rawExt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 8) || fallbackExt;

  return `media/${safeStem}.${safeExt}`;
}

async function decodeImageDimensionsAndBitmap(
  blob: Blob,
): Promise<{ bitmap: ImageBitmap; width: number; height: number } | null> {
  if (typeof createImageBitmap !== 'undefined') {
    try {
      const bitmap = await createImageBitmap(blob);
      return { bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      // Fall back to HTMLImageElement if createImageBitmap rejects SVG/exotic mime
    }
  }
  return null;
}

/**
 * Downscales large phone/scanner photos to `maxDimension` on the long edge
 * for snappy browser memory usage and lean .heirloom.zip exports.
 * Gracefully passes through in non-DOM (Vitest/Node) environments.
 */
export async function normalizeImageBlob(
  blob: Blob,
  maxDimension = 2400,
  quality = 0.86,
): Promise<{ blob: Blob; width?: number; height?: number; mimeType: string }> {
  const mimeType = blob.type || 'image/jpeg';

  // Skip canvas re-encoding for SVGs or non-DOM test environments
  if (
    mimeType === 'image/svg+xml' ||
    typeof document === 'undefined' ||
    typeof createImageBitmap === 'undefined'
  ) {
    return { blob, mimeType };
  }

  const decoded = await decodeImageDimensionsAndBitmap(blob);
  if (!decoded) {
    return { blob, mimeType };
  }

  const { bitmap, width, height } = decoded;
  try {
    const longEdge = Math.max(width, height);
    const alreadyCompact =
      longEdge <= maxDimension &&
      (mimeType === 'image/jpeg' ||
        mimeType === 'image/png' ||
        mimeType === 'image/webp') &&
      blob.size <= 1_500_000;

    if (alreadyCompact) {
      return { blob, width, height, mimeType };
    }

    const scale = longEdge > maxDimension ? maxDimension / longEdge : 1;
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { blob, width, height, mimeType };
    }

    const outputMime = mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
    if (outputMime === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);
    }
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);

    const encoded = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((out) => resolve(out), outputMime, quality),
    );
    if (!encoded) {
      return { blob, width, height, mimeType };
    }

    return {
      blob: encoded,
      width: targetW,
      height: targetH,
      mimeType: encoded.type || outputMime,
    };
  } finally {
    bitmap.close();
  }
}

let pdfWorkerConfigured = false;

/**
 * Lazily loads Mozilla PDF.js (plus Vite-bundled worker under base './'),
 * rasterizes a specific page of a PDF File/Blob onto an offscreen canvas,
 * and returns a crisp PNG Blob so certificates use a unified image pipeline.
 */
export async function rasterizePdfPage(
  file: File | Blob,
  pageNumber = 1,
  scale = 2.2,
): Promise<{
  blob: Blob;
  width: number;
  height: number;
  pageCount: number;
  mimeType: string;
}> {
  if (typeof document === 'undefined') {
    throw new Error('PDF rasterization requires a browser DOM environment.');
  }

  const [pdfjs, workerModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);

  if (!pdfWorkerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
    pdfWorkerConfigured = true;
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;

  try {
    const pageCount = Math.max(1, pdf.numPages);
    const clampedPage = Math.min(pageCount, Math.max(1, Math.round(pageNumber)));
    const page = await pdf.getPage(clampedPage);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not initialize 2D canvas context for PDF render.');
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const renderTask = page.render({
      canvas,
      canvasContext: ctx,
      viewport,
      background: '#ffffff',
    });
    await renderTask.promise;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((out) => resolve(out), 'image/png'),
    );
    if (!blob) {
      throw new Error('Failed to encode rasterized PDF page as PNG.');
    }

    return {
      blob,
      width: canvas.width,
      height: canvas.height,
      pageCount,
      mimeType: 'image/png',
    };
  } finally {
    await pdf.cleanup();
    await loadingTask.destroy();
  }
}

/** Extracts an image File from a paste ClipboardEvent (for Maps screenshots, etc.). */
export function extractImageFromClipboard(event: ClipboardEvent): File | null {
  const items = event.clipboardData?.items;
  if (!items) return null;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}

/** Generates a pre-searched Google Maps URL for one-click screenshot lookup. */
export function buildGoogleMapsSearchUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
}
