/**
 * echo-bot-v2.ts — 用重构后的新 API 编写的 echo bot
 *
 * 对比原 echo-bot.ts (279 行):
 *   - 用 FileTokenStore 替代手写的 ~30 行 token 持久化
 *   - 用 getMessageText/hasImage/hasVideo/hasFile/hasVoice/getFileName 替代手写的 ~40 行消息解析
 *   - 用 QrAuthProvider.fromConfig() 替代手动创建 ApiClient
 *   - 用 sdk.sendImage/sendVideo/sendFile/sendVoice/downloadMedia 替代 3 层嵌套调用
 *   - config 可不传 baseUrl/cdnBaseUrl（有默认值）
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WeixinSDK,
  QrAuthProvider,
  TokenAuthProvider,
  FileTokenStore,
  getMessageText,
  hasImage,
  hasVideo,
  hasFile,
  hasVoice,
  getFileName,
  type AuthResult,
  type WeixinMessage,
} from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, '.weixin-auth.json');

async function createSdk(): Promise<WeixinSDK> {
  const store = new FileTokenStore(AUTH_FILE);
  const saved = await store.load();

  if (saved?.token) {
    console.log(`[Auth] Reusing cached token for user ${saved.userId}`);
    return new WeixinSDK({
      config: { baseUrl: saved.baseUrl },
      auth: new TokenAuthProvider(saved.token, saved.userId),
    });
  }

  // 用 fromConfig() 替代 new ApiClient(config) + new QrAuthProvider(apiClient)
  const auth = QrAuthProvider.fromConfig({ pollingInterval: 1000, enableConsoleLog: true });
  auth.on('qr_generated', ({ url }) => {
    console.log('\n[Auth] Scan this QR code URL in WeChat:');
    console.log(url);
  });
  auth.on('qr_scanned', ({ status }) => console.log(`[Auth] QR status: ${status}`));
  auth.on('auth_success', (result: AuthResult) => {
    store.save({
      token: result.token,
      userId: result.userId,
      accountId: result.accountId,
      baseUrl: result.baseUrl,
      savedAt: Date.now(),
    });
  });

  return new WeixinSDK({ config: {}, auth });
}

async function main(): Promise<void> {
  if (process.argv.includes('--clear-auth')) {
    await new FileTokenStore(AUTH_FILE).clear();
    console.log('[Auth] Cleared cached auth');
    return;
  }

  const sdk = await createSdk();

  sdk.onMessage((message: WeixinMessage) => {
    const from = message.from_user_id;
    const ctx = message.context_token;

    if (!from || !ctx) {
      console.log('[Echo] Ignoring message without from/context_token');
      return;
    }

    // Echo text — 用 getMessageText() 替代手写的 extractText()
    const text = getMessageText(message);
    if (text) {
      console.log(`[Echo] ${from}: ${text}`);
      void sdk.sendText(from, `Echo: ${text}`, ctx).catch((error) => {
        console.error('[Echo] Failed to reply text:', error);
      });
    }

    if (hasImage(message) || hasVideo(message) || hasFile(message) || hasVoice(message)) {
      void (async () => {
        const media = await sdk.downloadMedia(message);
        if (!media) return;
        try {
          console.log(`[Echo] ${from}: echo ${media.type}`);
          await sdk.sendMedia(from, media.path, media.type, {
            fileName: media.type === 'file' ? getFileName(message) : undefined,
            contextToken: ctx,
          });
        } finally {
          await media.cleanup();
        }
      })().catch((error) => {
        console.error('[Echo] Failed to reply media:', error);
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
