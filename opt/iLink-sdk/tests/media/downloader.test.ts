import fs from 'fs/promises';
import path from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MediaDownloader } from '../../src/media/downloader.js';
import { aesEncrypt } from '../../src/media/crypto.js';
import { MessageItemType } from '../../src/api/types.js';
import type { WeixinMessage } from '../../src/api/types.js';

describe('MediaDownloader', () => {
  let originalFetch: typeof fetch;
  let mockFetch: ReturnType<typeof vi.fn>;
  let downloader: MediaDownloader;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    downloader = new MediaDownloader('https://cdn.example.com');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('downloads and decrypts an inbound image to a temp file', async () => {
    const plaintext = Buffer.from('fake-image-binary');
    const aesKeyHex = '00112233445566778899aabbccddeeff';
    const encrypted = aesEncrypt(plaintext, aesKeyHex);
    const message: WeixinMessage = {
      item_list: [
        {
          type: MessageItemType.IMAGE,
          image_item: {
            media: {
              encrypt_query_param: 'enc-param',
              aes_key: Buffer.from(aesKeyHex, 'utf-8').toString('base64'),
            },
          },
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: () => Promise.resolve(encrypted),
    });

    const downloaded = await downloader.downloadImage(message);

    expect(downloaded?.type).toBe('image');
    expect(downloaded?.mimeType).toBe('image/*');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://cdn.example.com/download?encrypted_query_param=enc-param'
    );

    const fileContent = await fs.readFile(downloaded!.path);
    expect(fileContent.equals(plaintext)).toBe(true);
    await downloaded!.cleanup();
  });

  it('writes to a provided output path without deleting it on cleanup', async () => {
    const outputPath = path.join('/tmp', `weixin-downloader-${Date.now()}.bin`);
    const plaintext = Buffer.from('content');
    const message: WeixinMessage = {
      item_list: [
        {
          type: MessageItemType.IMAGE,
          image_item: {
            media: {
              encrypt_query_param: 'plain-param',
            },
          },
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: () => Promise.resolve(plaintext),
    });

    const downloaded = await downloader.downloadImage(message, { outputPath });
    await downloaded!.cleanup();

    const fileContent = await fs.readFile(outputPath);
    expect(fileContent.equals(plaintext)).toBe(true);
    await fs.unlink(outputPath);
  });

  it('returns null when there is no downloadable image', async () => {
    const result = await downloader.downloadImage({ item_list: [] });
    expect(result).toBeNull();
  });

  it('downloads and decrypts a voice message', async () => {
    const plaintext = Buffer.from('voice-bytes');
    const aesKeyHex = '00112233445566778899aabbccddeeff';
    const encrypted = aesEncrypt(plaintext, aesKeyHex);
    const message: WeixinMessage = {
      item_list: [
        {
          type: MessageItemType.VOICE,
          voice_item: {
            media: {
              encrypt_query_param: 'voice-param',
              aes_key: Buffer.from(aesKeyHex, 'utf-8').toString('base64'),
            },
          },
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: () => Promise.resolve(encrypted),
    });

    const downloaded = await downloader.downloadVoice(message);
    expect(downloaded?.type).toBe('voice');
    expect(downloaded?.mimeType).toBe('audio/silk');
    const fileContent = await fs.readFile(downloaded!.path);
    expect(fileContent.equals(plaintext)).toBe(true);
    await downloaded!.cleanup();
  });

  it('downloads and decrypts a file attachment with mime inference', async () => {
    const plaintext = Buffer.from('pdf-bytes');
    const aesKeyHex = '00112233445566778899aabbccddeeff';
    const encrypted = aesEncrypt(plaintext, aesKeyHex);
    const message: WeixinMessage = {
      item_list: [
        {
          type: MessageItemType.FILE,
          file_item: {
            file_name: 'report.pdf',
            media: {
              encrypt_query_param: 'file-param',
              aes_key: Buffer.from(aesKeyHex, 'utf-8').toString('base64'),
            },
          },
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: () => Promise.resolve(encrypted),
    });

    const downloaded = await downloader.downloadFile(message);
    expect(downloaded?.type).toBe('file');
    expect(downloaded?.mimeType).toBe('application/pdf');
    expect(downloaded?.path.endsWith('.pdf')).toBe(true);
    await downloaded!.cleanup();
  });

  it('downloads and decrypts a video message', async () => {
    const plaintext = Buffer.from('video-bytes');
    const aesKeyHex = '00112233445566778899aabbccddeeff';
    const encrypted = aesEncrypt(plaintext, aesKeyHex);
    const message: WeixinMessage = {
      item_list: [
        {
          type: MessageItemType.VIDEO,
          video_item: {
            media: {
              encrypt_query_param: 'video-param',
              aes_key: Buffer.from(aesKeyHex, 'utf-8').toString('base64'),
            },
          },
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: () => Promise.resolve(encrypted),
    });

    const downloaded = await downloader.downloadVideo(message);
    expect(downloaded?.type).toBe('video');
    expect(downloaded?.mimeType).toBe('video/mp4');
    await downloaded!.cleanup();
  });

  it('downloadFirstMedia follows image > video > file > voice priority', async () => {
    const plaintext = Buffer.from('image-priority');
    const aesKeyHex = '00112233445566778899aabbccddeeff';
    const encrypted = aesEncrypt(plaintext, aesKeyHex);
    const encodedKey = Buffer.from(aesKeyHex, 'utf-8').toString('base64');
    const message: WeixinMessage = {
      item_list: [
        {
          type: MessageItemType.FILE,
          file_item: { file_name: 'x.txt', media: { encrypt_query_param: 'file', aes_key: encodedKey } },
        },
        {
          type: MessageItemType.IMAGE,
          image_item: { media: { encrypt_query_param: 'image', aes_key: encodedKey } },
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: () => Promise.resolve(encrypted),
    });

    const downloaded = await downloader.downloadFirstMedia(message);
    expect(downloaded?.type).toBe('image');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://cdn.example.com/download?encrypted_query_param=image'
    );
    await downloaded!.cleanup();
  });
});
