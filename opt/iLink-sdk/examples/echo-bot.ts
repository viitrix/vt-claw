import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'url';
import {
  WeixinSDK,
  QrAuthProvider,
  TokenAuthProvider,
  ApiClient,
  UploadMediaType,
  DEFAULT_BASE_URL,
  DEFAULT_CDN_BASE_URL,
  getMessageText,
  hasImage,
  hasVideo,
  hasFile,
  hasVoice,
  getFileName,
  type AuthResult,
  type WeixinConfig,
  type WeixinMessage,
} from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTH_FILE = path.join(__dirname, '.weixin-auth.json');

type SavedAuth = {
  token: string;
  userId: string;
  accountId?: string;
  baseUrl: string;
  savedAt: number;
};

function loadSavedAuth(): SavedAuth | null {
  try {
    if (!fs.existsSync(AUTH_FILE)) {
      return null;
    }

    return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8')) as SavedAuth;
  } catch (error) {
    console.warn('[Auth] Failed to read saved auth:', error);
    return null;
  }
}

function saveAuth(auth: SavedAuth): void {
  fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2));
  console.log(`[Auth] Saved token cache to ${AUTH_FILE}`);
}

function clearAuth(): void {
  if (fs.existsSync(AUTH_FILE)) {
    fs.unlinkSync(AUTH_FILE);
    console.log('[Auth] Cleared cached auth');
  }
}

async function createSdk(): Promise<WeixinSDK> {
  const savedAuth = loadSavedAuth();
  const config: WeixinConfig = {
    baseUrl: savedAuth?.baseUrl ?? DEFAULT_BASE_URL,
    cdnBaseUrl: DEFAULT_CDN_BASE_URL,
    timeout: 15000,
    longPollTimeoutMs: 35000,
    retries: 3,
    enableConsoleLog: true,
    pollingInterval: 1000,
  };

  if (savedAuth?.token) {
    console.log(`[Auth] Reusing cached token for user ${savedAuth.userId}`);
    return new WeixinSDK({
      config,
      auth: new TokenAuthProvider(savedAuth.token, savedAuth.userId),
    });
  }

  const apiClient = new ApiClient(config);
  const auth = new QrAuthProvider(apiClient, '3');
  auth.on('qr_generated', ({ url }) => {
    console.log('\n[Auth] Scan this QR code URL in WeChat:');
    console.log(url);
  });
  auth.on('qr_scanned', ({ status }) => {
    console.log(`[Auth] QR status: ${status}`);
  });
  auth.on('auth_success', (result: AuthResult) => {
    saveAuth({
      token: result.token,
      userId: result.userId,
      accountId: result.accountId,
      baseUrl: result.baseUrl ?? config.baseUrl,
      savedAt: Date.now(),
    });
  });

  return new WeixinSDK({ config, auth });
}

async function main(): Promise<void> {
  if (process.argv.includes('--clear-auth')) {
    clearAuth();
    return;
  }

  const sdk = await createSdk();

  sdk.onMessage((message) => {
    const from = message.from_user_id;
    const contextToken = message.context_token;
    const text = getMessageText(message);

    if (!from || !contextToken) {
      console.log('[Echo] Ignoring message without from/context_token');
      return;
    }

    if (text) {
      const reply = `Echo: ${text}`;
      console.log(`[Echo] ${from}: ${text}`);
      void sdk.sendText(from, reply, contextToken).catch((error) => {
        console.error('[Echo] Failed to reply text:', error);
      });
    }

    if (hasImage(message)) {
      void (async () => {
        const downloaded = await sdk.media.downloader.downloadFirstMedia(message);
        if (!downloaded || downloaded.type !== 'image') {
          return;
        }

        try {
          console.log(`[Echo] ${from}: echo image`);
          await sdk.messaging.sender.sendMedia({
            to: from,
            filePath: downloaded.path,
            mediaType: UploadMediaType.IMAGE,
            contextToken,
          });
        } finally {
          await downloaded.cleanup();
        }
      })().catch((error) => {
        console.error('[Echo] Failed to reply image:', error);
      });
    }

    if (hasVideo(message)) {
      void (async () => {
        const downloaded = await sdk.media.downloader.downloadVideo(message);
        if (!downloaded) {
          return;
        }

        try {
          console.log(`[Echo] ${from}: echo video`);
          await sdk.messaging.sender.sendMedia({
            to: from,
            filePath: downloaded.path,
            mediaType: UploadMediaType.VIDEO,
            contextToken,
          });
        } finally {
          await downloaded.cleanup();
        }
      })().catch((error) => {
        console.error('[Echo] Failed to reply video:', error);
      });
    }

    if (hasFile(message)) {
      void (async () => {
        const downloaded = await sdk.media.downloader.downloadFile(message);
        if (!downloaded) {
          return;
        }

        try {
          console.log(`[Echo] ${from}: echo file`);
          await sdk.messaging.sender.sendMedia({
            to: from,
            filePath: downloaded.path,
            fileName: getFileName(message),
            mediaType: UploadMediaType.FILE,
            contextToken,
          });
        } finally {
          await downloaded.cleanup();
        }
      })().catch((error) => {
        console.error('[Echo] Failed to reply file:', error);
      });
    }

    if (hasVoice(message)) {
      void (async () => {
        const downloaded = await sdk.media.downloader.downloadVoice(message);
        if (!downloaded) {
          return;
        }

        try {
          console.log(`[Echo] ${from}: echo voice`);
          await sdk.messaging.sender.sendMedia({
            to: from,
            filePath: downloaded.path,
            mediaType: UploadMediaType.VOICE,
            contextToken,
          });
        } finally {
          await downloaded.cleanup();
        }
      })().catch((error) => {
        console.error('[Echo] Failed to reply voice:', error);
      });
    }
  });

  sdk.on('error', (error) => {
    console.error('[SDK] Error:', error);
  });

  await sdk.start();
  console.log('[SDK] Echo bot is running. Press Ctrl+C to exit.');

  process.on('SIGINT', async () => {
    await sdk.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
