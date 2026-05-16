# wechat-ilink-sdk

TypeScript SDK for the WeChat iLink bot protocol.

[中文文档](./README.zh-CN.md)

It includes:
- QR login and token-based authentication
- `getupdates` long-polling receive loop with automatic cursor management
- Text and media sending (image, video, file, voice)
- CDN upload with AES-128-ECB encryption
- Inbound media download and AES decryption

Zero runtime dependencies — uses only Node.js built-ins (`crypto`, `fs`, `path`, `os`, `fetch`).

## Install

```bash
npm install wechat-ilink-sdk
```

## Quick Start

```ts
import {
  WeixinSDK,
  TokenAuthProvider,
  LogLevel,
} from 'wechat-ilink-sdk';

const sdk = new WeixinSDK({
  config: {
    timeout: 15000,
    longPollTimeoutMs: 35000,
    pollingInterval: 1000,
    retries: 3,
    logLevel: LogLevel.INFO,
    enableConsoleLog: true,
  },
  auth: new TokenAuthProvider(
    process.env.WEIXIN_TOKEN!,
    process.env.WEIXIN_USER_ID
  ),
});

sdk.onMessage((message) => {
  console.log('from:', message.from_user_id);
  console.log('text:', message.item_list?.[0]?.text_item?.text);
});

await sdk.start();
await sdk.sendText('target-user-id', 'hello');
```

Default values:
- API base URL: `https://ilinkai.weixin.qq.com`
- CDN base URL: `https://novac2c.cdn.weixin.qq.com/c2c`
- QR login `bot_type`: `3`

## Authentication

### Token Auth

Use a pre-obtained bot token:

```ts
import { WeixinSDK, TokenAuthProvider } from 'wechat-ilink-sdk';

const sdk = new WeixinSDK({
  auth: new TokenAuthProvider(
    process.env.WEIXIN_TOKEN!,
    process.env.WEIXIN_USER_ID
  ),
  config: {},
});
```

### QR Login

```ts
import { WeixinSDK, QrAuthProvider } from 'wechat-ilink-sdk';

const auth = QrAuthProvider.fromConfig({}, '3');

auth.on('qr_generated', ({ url }) => {
  console.log('Open this URL to scan QR code:', url);
});

auth.on('qr_scanned', () => {
  console.log('QR code scanned, waiting for confirmation...');
});

const sdk = new WeixinSDK({ config: {}, auth });
await sdk.start();
```

### Token Persistence

```ts
import { FileTokenStore, QrAuthProvider } from 'wechat-ilink-sdk';

const tokenStore = new FileTokenStore('./token.json');
const cached = tokenStore.load();

if (cached) {
  const sdk = new WeixinSDK({
    config: {},
    auth: new TokenAuthProvider(cached.token, cached.userId),
  });
} else {
  const auth = QrAuthProvider.fromConfig({});
  // ... QR login flow, then save:
  const result = await auth.authenticate();
  tokenStore.save({ token: result.token, userId: result.userId });
}
```

## Receiving Messages

```ts
sdk.onMessage((message) => {
  const text = message.item_list?.[0]?.text_item?.text;
  console.log(`[${message.from_user_id}]: ${text}`);
});
```

The `WeixinMessage` type contains:
- `from_user_id` / `to_user_id` — sender and receiver
- `context_token` — required for replies
- `item_list` — array of `MessageItem` (text, image, voice, file, video)
- `message_type` — `MessageType.USER` or `MessageType.BOT`
- `session_id` / `group_id` — conversation identifiers

## Sending Messages

### Reply to a Message

Replies should carry the inbound `context_token`:

```ts
sdk.onMessage(async (message) => {
  const to = message.from_user_id;
  const contextToken = message.context_token;
  if (!to || !contextToken) return;

  await sdk.sendText(to, 'Echo reply', contextToken);
});
```

### Send Text

```ts
await sdk.sendText('target-user-id', 'Hello!', 'optional-context-token');
```

### Send Media

The SDK provides convenience methods for each media type:

```ts
// Send image
await sdk.sendImage('target-user-id', '/tmp/photo.png', {
  contextToken: 'message-context-token',
});

// Send video
await sdk.sendVideo('target-user-id', '/tmp/clip.mp4', {
  contextToken: 'message-context-token',
});

// Send file (with optional custom filename)
await sdk.sendFile('target-user-id', '/tmp/report.bin', {
  fileName: 'report.pdf',
  contextToken: 'message-context-token',
});

// Send voice
await sdk.sendVoice('target-user-id', '/tmp/audio.silk', {
  contextToken: 'message-context-token',
});
```

Or use the generic `sendMedia` method:

```ts
await sdk.sendMedia('target-user-id', '/tmp/photo.png', 'image', {
  contextToken: 'message-context-token',
});
```

Supported media types: `'image'`, `'video'`, `'file'`, `'voice'`.

### Send Typing Indicator

```ts
import { ApiEndpoints, TypingStatus } from 'wechat-ilink-sdk';

const endpoints = new ApiEndpoints(apiClient);

// Get typing ticket first
const config = await endpoints.getConfig({ ilink_user_id: 'user-id' });

// Send typing indicator
await endpoints.sendTyping({
  ilink_user_id: 'target-user-id',
  typing_ticket: config.typing_ticket,
  status: TypingStatus.TYPING,
});
```

## Downloading Inbound Media

Download and decrypt media from received messages:

```ts
sdk.onMessage(async (message) => {
  const downloaded = await sdk.downloadMedia(message);
  if (!downloaded) return;

  console.log(downloaded.type);    // 'image' | 'video' | 'file' | 'voice'
  console.log(downloaded.path);    // local file path
  console.log(downloaded.mimeType);

  // Clean up temp file when done
  await downloaded.cleanup();
});
```

You can also specify an output path or download a specific media type:

```ts
// Download to a specific path
const result = await sdk.media.downloader.downloadImage(message, {
  outputPath: '/tmp/photo.png',
});

// Download specific media type
await sdk.media.downloader.downloadVideo(message);
await sdk.media.downloader.downloadVoice(message);
await sdk.media.downloader.downloadFile(message);
```

### Media Helper Functions

```ts
import {
  getMessageText,
  hasImage,
  hasVideo,
  hasVoice,
  hasFile,
  getFileName,
} from 'wechat-ilink-sdk';

// Extract text from a message (supports text and voice-to-text)
const text = getMessageText(message);

// Check for specific media types
if (hasImage(message)) { /* ... */ }
if (hasVideo(message)) { /* ... */ }

// Get file name from file messages
const name = getFileName(message);
```

## Echo Bot

An end-to-end example is included at [examples/echo-bot.ts](./examples/echo-bot.ts).

Features:
- QR login with local token cache
- Text echo
- Image/video/file/voice echo

```bash
npx tsx examples/echo-bot.ts
```

Clear cached auth:

```bash
npx tsx examples/echo-bot.ts --clear-auth
```

## API Surface

```ts
import {
  // Core
  WeixinSDK,
  LogLevel,
  WeixinSDKError,
  ErrorCode,

  // API
  ApiClient,
  ApiEndpoints,

  // Auth
  TokenAuthProvider,
  QrAuthProvider,
  FileTokenStore,

  // Messaging
  MessageSender,
  MessageReceiver,

  // Media
  MediaUploader,
  MediaDownloader,

  // Crypto utilities
  aesEncrypt,
  aesDecrypt,
  md5,
  generateAesKey,

  // Types
  type WeixinConfig,
  type WeixinMessage,
  type MessageItem,
  type DownloadedMedia,
  UploadMediaType,
  MessageType,
  MessageItemType,
  MessageState,
  TypingStatus,
} from 'wechat-ilink-sdk';
```

## Config

`WeixinConfig` fields:

| Field | Type | Default | Description |
|---|---|---|---|
| `baseUrl` | `string` | `https://ilinkai.weixin.qq.com` | iLink API base URL |
| `cdnBaseUrl` | `string` | `https://novac2c.cdn.weixin.qq.com/c2c` | CDN base URL |
| `timeout` | `number` | `30000` | Normal API timeout (ms) |
| `longPollTimeoutMs` | `number` | `35000` | `getupdates` long-poll timeout (ms) |
| `retries` | `number` | `3` | Retry count for retryable requests |
| `pollingInterval` | `number` | `30000` | Fallback delay between polls (ms) |
| `logLevel` | `LogLevel` | `LogLevel.INFO` | Log verbosity |
| `enableConsoleLog` | `boolean` | `true` | Print logs to console |

## Key Protocol Details

- All API requests are JSON POST; CDN upload/download is binary.
- Media encryption: AES-128-ECB with random 16-byte key (32 hex chars).
- `get_updates_buf` is a cursor preserved across polls; reset on `errcode === -14` (session timeout).
- iLink v2.1+ returns `upload_full_url` instead of `upload_param` — the uploader handles both.
- The receiver automatically uses `longpolling_timeout_ms` from the server response to adjust polling interval.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

## License

MIT
