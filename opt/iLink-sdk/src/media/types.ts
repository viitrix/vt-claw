export { UploadMediaType } from '../api/types.js';

export interface UploadOptions {
  filePath: string;
  mediaType: number;
  toUserId?: string;
  cdnBaseUrl?: string;
}

export interface UploadResult {
  filekey: string;
  downloadParam: string;
  aesKey: string;
  fileSize: number;
  fileSizeCiphertext: number;
  fileId: string;
}
