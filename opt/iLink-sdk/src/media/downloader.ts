import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { aesDecrypt } from './crypto.js';
import { getMimeFromFilename } from './mime.js';
import { MessageItemType, findMediaItem } from '../api/types.js';
import type { WeixinMessage } from '../api/types.js';

export interface DownloadMediaOptions {
  outputPath?: string;
}

export interface DownloadedMedia {
  type: 'image' | 'voice' | 'file' | 'video';
  path: string;
  mimeType: string;
  cleanup: () => Promise<void>;
}

function buildCdnDownloadUrl(cdnBaseUrl: string, encryptedQueryParam: string): string {
  return `${cdnBaseUrl}/download?encrypted_query_param=${encodeURIComponent(encryptedQueryParam)}`;
}

function parseAesKey(aesKeyBase64: string): string {
  const decoded = Buffer.from(aesKeyBase64, 'base64');
  if (decoded.length === 16) {
    return decoded.toString('hex');
  }
  if (decoded.length === 32 && /^[0-9a-fA-F]{32}$/.test(decoded.toString('ascii'))) {
    return decoded.toString('ascii').toLowerCase();
  }
  throw new Error(`Unsupported aes_key payload length: ${decoded.length}`);
}

function defaultOutputPath(prefix: string, ext: string): string {
  return path.join(os.tmpdir(), `weixin-media-${prefix}-${crypto.randomUUID()}${ext}`);
}

async function writeDownloadedMedia(
  plaintext: Buffer,
  mediaType: DownloadedMedia['type'],
  mimeType: string,
  options: DownloadMediaOptions,
  fallbackExt: string
): Promise<DownloadedMedia> {
  const outputPath = options.outputPath ?? defaultOutputPath(mediaType, fallbackExt);
  await fs.writeFile(outputPath, plaintext);

  return {
    type: mediaType,
    path: outputPath,
    mimeType,
    cleanup: async () => {
      if (!options.outputPath) {
        await fs.unlink(outputPath).catch(() => {});
      }
    },
  };
}

async function fetchMediaBuffer(cdnBaseUrl: string, encryptedQueryParam: string, aesKeyBase64?: string): Promise<Buffer> {
  const url = buildCdnDownloadUrl(cdnBaseUrl, encryptedQueryParam);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status} ${response.statusText}`);
  }

  const encrypted = Buffer.from(await response.arrayBuffer());
  return aesKeyBase64 ? aesDecrypt(encrypted, parseAesKey(aesKeyBase64)) : encrypted;
}

export class MediaDownloader {
  constructor(private readonly cdnBaseUrl: string) {}

  async downloadImage(message: WeixinMessage, options: DownloadMediaOptions = {}): Promise<DownloadedMedia | null> {
    const item = findMediaItem(message, MessageItemType.IMAGE);
    const media = item?.image_item?.media;
    if (!media?.encrypt_query_param) {
      return null;
    }

    const aesKeyBase64 = item?.image_item?.aeskey
      ? Buffer.from(item.image_item.aeskey, 'hex').toString('base64')
      : media.aes_key;
    const plaintext = await fetchMediaBuffer(this.cdnBaseUrl, media.encrypt_query_param, aesKeyBase64);
    return writeDownloadedMedia(plaintext, 'image', 'image/*', options, '.img');
  }

  async downloadVoice(message: WeixinMessage, options: DownloadMediaOptions = {}): Promise<DownloadedMedia | null> {
    const item = findMediaItem(message, MessageItemType.VOICE);
    const media = item?.voice_item?.media;
    if (!media?.encrypt_query_param || !media.aes_key) {
      return null;
    }

    const plaintext = await fetchMediaBuffer(this.cdnBaseUrl, media.encrypt_query_param, media.aes_key);
    return writeDownloadedMedia(plaintext, 'voice', 'audio/silk', options, '.sil');
  }

  async downloadFile(message: WeixinMessage, options: DownloadMediaOptions = {}): Promise<DownloadedMedia | null> {
    const item = findMediaItem(message, MessageItemType.FILE);
    const media = item?.file_item?.media;
    if (!media?.encrypt_query_param || !media.aes_key) {
      return null;
    }

    const plaintext = await fetchMediaBuffer(this.cdnBaseUrl, media.encrypt_query_param, media.aes_key);
    const mimeType = getMimeFromFilename(item?.file_item?.file_name ?? 'file.bin');
    const ext = path.extname(item?.file_item?.file_name ?? '') || '.bin';
    return writeDownloadedMedia(plaintext, 'file', mimeType, options, ext);
  }

  async downloadVideo(message: WeixinMessage, options: DownloadMediaOptions = {}): Promise<DownloadedMedia | null> {
    const item = findMediaItem(message, MessageItemType.VIDEO);
    const media = item?.video_item?.media;
    if (!media?.encrypt_query_param || !media.aes_key) {
      return null;
    }

    const plaintext = await fetchMediaBuffer(this.cdnBaseUrl, media.encrypt_query_param, media.aes_key);
    return writeDownloadedMedia(plaintext, 'video', 'video/mp4', options, '.mp4');
  }

  async downloadFirstMedia(message: WeixinMessage, options: DownloadMediaOptions = {}): Promise<DownloadedMedia | null> {
    return (
      await this.downloadImage(message, options) ??
      await this.downloadVideo(message, options) ??
      await this.downloadFile(message, options) ??
      await this.downloadVoice(message, options)
    );
  }
}
