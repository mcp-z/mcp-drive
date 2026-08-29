/** Streaming file source utilities for memory-efficient uploads (no temp files) */

import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { basename, extname, resolve } from 'path';
import { Readable } from 'stream';
import type { ReadableStream as NodeReadableStream } from 'stream/web';

/** Resolved source for an upload URI: a readable stream plus naming/MIME hints */
export interface FileSource {
  /** Binary read stream of the file content */
  stream: Readable;
  /** Best-effort file name (used as default Drive name) */
  fileName: string;
  /** MIME type from the Content-Type header (http/https sources only) */
  contentType?: string;
  /** File size in bytes when known (file:// via stat, http/https via Content-Length) */
  size?: number;
}

/** Common extension → MIME map; falls back to application/octet-stream */
const MIME_BY_EXTENSION: Record<string, string> = {
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.gif': 'image/gif',
  '.gz': 'application/gzip',
  '.html': 'text/html',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.rtf': 'application/rtf',
  '.svg': 'image/svg+xml',
  '.tar': 'application/x-tar',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xml': 'application/xml',
  '.zip': 'application/zip',
};

/** Guess MIME type from file name extension (application/octet-stream fallback) */
export function guessMimeType(fileName: string): string {
  return MIME_BY_EXTENSION[extname(fileName).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Get readable stream and metadata from a file URI
 *
 * Memory efficiency:
 * - file:// URIs stream directly from disk
 * - http:// URIs stream directly from response (no temp files!)
 *
 * Unlike mcp-sheets' getCsvReadStream, this streams binary content
 * (no text encoding) so arbitrary file types can be uploaded.
 *
 * @example
 * ```ts
 * const source = await getFileReadStream('file:///path/to/report.pdf');
 * await drive.files.create({
 *   requestBody: { name: source.fileName },
 *   media: { mimeType: guessMimeType(source.fileName), body: source.stream },
 * });
 * ```
 */
export async function getFileReadStream(fileUri: string): Promise<FileSource> {
  if (fileUri.startsWith('file://')) {
    // Local file - stream directly from disk
    const rawPath = fileUri.slice('file://'.length);
    const filePath = rawPath.startsWith('/') ? rawPath : resolve(rawPath);
    const fileSize = (await stat(filePath)).size;
    return {
      stream: createReadStream(filePath),
      fileName: basename(filePath),
      size: fileSize,
    };
  }

  if (fileUri.startsWith('http://') || fileUri.startsWith('https://')) {
    // Remote file - stream directly from fetch response
    const response = await fetch(fileUri);
    if (!response.ok) {
      throw new Error(`Failed to fetch file from ${fileUri}: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error(`No response body from ${fileUri}`);
    }

    // Convert web stream to Node.js stream
    // response.body is ReadableStream<Uint8Array> from fetch API
    // Cast to Node.js ReadableStream type for compatibility with Readable.fromWeb
    const stream = Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>);
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim();
    const contentLength = response.headers.get('content-length');

    return {
      stream,
      fileName: getRemoteFileName(response.headers.get('content-disposition'), fileUri),
      ...(contentType && { contentType }),
      ...(contentLength && { size: Number.parseInt(contentLength, 10) }),
    };
  }

  throw new Error(`Invalid file URI: ${fileUri}. Must start with file://, http://, or https://`);
}

/** Best-effort file name for a remote source: Content-Disposition, then URL path */
function getRemoteFileName(contentDisposition: string | null, fileUri: string): string {
  if (contentDisposition) {
    const match = /filename="([^"]+)"|filename=([^;]+)/i.exec(contentDisposition);
    const fromHeader = match?.[1] ?? match?.[2];
    if (fromHeader) {
      return fromHeader.trim();
    }
  }

  try {
    return decodeURIComponent(basename(new URL(fileUri).pathname)) || 'upload.bin';
  } catch {
    return 'upload.bin';
  }
}
