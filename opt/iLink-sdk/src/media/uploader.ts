import fs from 'fs/promises';
import crypto from 'crypto';
import { ApiEndpoints } from '../api/endpoints.js';
import { aesEncrypt, generateAesKey, md5 } from './crypto.js';
import type { UploadOptions, UploadResult } from './types.js';

export class MediaUploader {
  constructor(
    private api: ApiEndpoints,
    private cdnBaseUrl: string
  ) {}

  async upload(options: UploadOptions): Promise<UploadResult> {
    const { filePath, mediaType, toUserId, cdnBaseUrl } = options;
    const cdnBase = cdnBaseUrl || this.cdnBaseUrl;

    const fileBuffer = await fs.readFile(filePath);
    const rawSize = fileBuffer.length;
    const rawMd5 = md5(fileBuffer);
    const filekey = crypto.randomBytes(16).toString('hex');
    const aesKey = generateAesKey();
    const encryptedBuffer = aesEncrypt(fileBuffer, aesKey);
    const encryptedSize = encryptedBuffer.length;

    const uploadUrlResp = await this.api.getUploadUrl({
      filekey,
      media_type: mediaType,
      to_user_id: toUserId,
      rawsize: rawSize,
      rawfilemd5: rawMd5,
      filesize: encryptedSize,
      no_need_thumb: true,
      aeskey: aesKey,
    });

    let uploadParam = uploadUrlResp.upload_param;
    if (!uploadParam && uploadUrlResp.upload_full_url) {
      // iLink v2.1+ returns upload_full_url instead of upload_param
      const url = new URL(uploadUrlResp.upload_full_url);
      uploadParam = url.searchParams.get('encrypted_query_param') ?? undefined;
    }
    if (!uploadParam) {
      throw new Error('Failed to get upload URL');
    }

    const cdnUrl = `${cdnBase}/upload?encrypted_query_param=${encodeURIComponent(uploadParam)}&filekey=${encodeURIComponent(filekey)}`;
    const response = await fetch(cdnUrl, {
      method: 'POST',
      body: new Uint8Array(encryptedBuffer),
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    });

    if (response.status >= 400 && response.status < 500) {
      throw new Error(`CDN upload failed: ${response.status} ${await response.text()}`);
    }
    if (response.status !== 200) {
      throw new Error(`CDN upload failed: ${response.status}`);
    }

    const downloadParam = response.headers.get('x-encrypted-param');
    if (!downloadParam) {
      throw new Error('CDN upload response missing x-encrypted-param header');
    }

    return {
      filekey,
      downloadParam,
      aesKey,
      fileSize: rawSize,
      fileSizeCiphertext: encryptedSize,
      fileId: downloadParam,
    };
  }
}
