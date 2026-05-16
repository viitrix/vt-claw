import crypto from 'crypto';

export function generateAesKey(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function aesEncrypt(data: Buffer, key: string): Buffer {
  const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(key, 'hex'), null);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

export function aesDecrypt(data: Buffer, key: string): Buffer {
  const decipher = crypto.createDecipheriv('aes-128-ecb', Buffer.from(key, 'hex'), null);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export function md5(data: Buffer | string): string {
  const buffer = typeof data === 'string' ? Buffer.from(data) : data;
  return crypto.createHash('md5').update(buffer).digest('hex');
}
