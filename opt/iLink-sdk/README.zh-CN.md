# wechat-ilink-sdk

微信 iLink 机器人协议的 TypeScript SDK。

[English README](./README.md)

目前已经封装：

- Token 登录和二维码登录
- `getupdates` 长轮询收消息（自动管理游标）
- 文本和媒体发送（图片、视频、文件、语音）
- CDN 上传（AES-128-ECB 加密）
- 入站媒体下载和解密

零运行时依赖 — 仅使用 Node.js 内置模块（`crypto`、`fs`、`path`、`os`、`fetch`）。

## 安装

```bashwechat-ilink-sdk
npm install @xmccln/wechat-ilink-sdk
```

## 快速开始

```ts
import {
  WeixinSDK,
  TokenAuthProvider,
  LogLevel,
} from '@xmccln/wechat-ilink-sdk';

const sdk = new WeixinSDK({
  config: {
    timeout: 15000,
    longPollTimeoutMs: 35000,
    pollingInterval: 1000,
    retrwechat-ilink-sdk
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

默认值：

- API Base URL: `https://ilinkai.weixin.qq.com`
- CDN Base URL: `https://novac2c.cdn.weixin.qq.com/c2c`
- 二维码登录 `bot_type`: `3`

## 认证

### Token 认证

使用预先获取的 bot token：

```ts
import { WeixinSDK, TokenAuthProvider } from '@xmccln/wechat-ilink-sdk';

const sdk = new WeixinSDK({
  auth: wechat-ilink-sdk
    process.env.WEIXIN_TOKEN!,
    process.env.WEIXIN_USER_ID
  ),
  config: {},
});
```

### 二维码登录

```ts
import { WeixinSDK, QrAuthProvider } from '@xmccln/wechat-ilink-sdk';

const auth = QrAuthProvider.fromConfig({}, '3');

auth.on('qr_generated', ({ url }) => {
  console.log('打开以下链接扫码:', url);
});

auth.on('qr_scanned', () => {
  console.log('已扫码，等待确认...');
});

const sdk = new WeixinSDK({ config: {}, auth });
await sdk.start();
```

### Token 持久化

```ts
import { FileTokenStore, QrAuthProvider } from '@xmccln/wechat-ilink-sdk';

const tokenStore = new FileTokenStore('./token.json');
const cached = tokenStore.load();

if (cached) {wechat-ilink-sdk
  const sdk = new WeixinSDK({
    config: {},
    auth: new TokenAuthProvider(cached.token, cached.userId),
  });
} else {
  const auth = QrAuthProvider.fromConfig({});
  // ... 二维码登录流程，登录成功后保存：
  const result = await auth.authenticate();
  tokenStore.save({ token: result.token, userId: result.userId });
}
```

## 收消息

```ts
sdk.onMessage((message) => {
  const text = message.item_list?.[0]?.text_item?.text;
  console.log(`[${message.from_user_id}]: ${text}`);
});
```

`WeixinMessage` 主要字段：

- `from_user_id` / `to_user_id` — 发送者和接收者
- `context_token` — 回复时必须携带
- `item_list` — `MessageItem` 数组（文本、图片、语音、文件、视频）
- `message_type` — `MessageType.USER` 或 `MessageType.BOT`
- `session_id` / `group_id` — 会话标识

## 发送消息

### 回复消息

回复时应该带上入站消息里的 `context_token`：

```ts
sdk.onMessage(async (message) => {
  const to = message.from_user_id;
  const contextToken = message.context_token;
  if (!to || !contextToken) return;

  await sdk.sendText(to, '收到', contextToken);
});
```

### 发送文本

```ts
await sdk.sendText('target-user-id', '你好！', 'optional-context-token');
```

### 发送媒体

SDK 为每种媒体类型提供了便捷方法：

```ts
// 发送图片
await sdk.sendImage('target-user-id', '/tmp/photo.png', {
  contextToken: 'message-context-token',
});

// 发送视频
await sdk.sendVideo('target-user-id', '/tmp/clip.mp4', {
  contextToken: 'message-context-token',
});

// 发送文件（可选自定义文件名）
await sdk.sendFile('target-user-id', '/tmp/report.bin', {
  fileName: 'report.pdf',
  contextToken: 'message-context-token',
});

// 发送语音
await sdk.sendVoice('target-user-id', '/tmp/audio.silk', {
  contextToken: 'message-context-token',
});
```

也可以使用通用的 `sendMedia` 方法：

```ts
await sdk.sendMedia('target-user-id', '/tmp/photo.png', 'image', {
  contextToken: 'message-context-token',
});
```

支持的媒体类型：`'image'`、`'video'`、`'file'`、`'voice'`。

### 发送正在输入状态

```ts
import { ApiEndpoints, TypingStatus } from '@xmccln/wechat-ilink-sdk';

const endpoints = new ApiEndpoints(apiClient);

// 先获取 typing ticket
const config = await endpoints.getConfig({ ilink_user_id: 'user-id' });

// 发送正在输入状态
await endpoints.sendTyping({
  ilink_user_id: 'target-user-id',
  typing_ticket: config.typing_ticket,
  status: TypingStatus.TYPING,
});wechat-ilink-sdk
```

## 下载入站媒体

下载并解密收到的媒体消息：

```ts
sdk.onMessage(async (message) => {
  const downloaded = await sdk.downloadMedia(message);
  if (!downloaded) return;

  console.log(downloaded.type);    // 'image' | 'video' | 'file' | 'voice'
  console.log(downloaded.path);    // 本地文件路径
  console.log(downloaded.mimeType);

  // 用完清理临时文件
  await downloaded.cleanup();
});
```

可以指定输出路径或下载特定类型的媒体：

```ts
// 下载到指定路径
const result = await sdk.media.downloader.downloadImage(message, {
  outputPath: '/tmp/photo.png',
});

// 下载特定类型的媒体
await sdk.media.downloader.downloadVideo(message);
await sdk.media.downloader.downloadVoice(message);
await sdk.media.downloader.downloadFile(message);
```

### 媒体辅助函数

```ts
import {
  getMessageText,
  hasImage,
  hasVideo,
  hasVoice,
  hasFile,
  getFileName,
} from '@xmccln/wechat-ilink-sdk';

// 提取消息文本（支持文本和语音转文字）
const text = getMessageText(message);

// 判断是否包含特定媒体类型
if (hasImage(message)) { /* ... */ }
if (hasVideo(message)) { /* ... */ }

// 获取文件消息的文件名
const name = getFileName(message);
```

## Echo Bot

完整示例见 [examples/echo-bot.ts](./examples/echo-bot.ts)。

功能：

- 二维码登录和本地 token 缓存
- 文本/图片/视频/文件/语音回显

```bash
npx tsx examples/echo-bot.ts
```

清理本地缓存认证：

```bash
npx tsx examples/echo-bot.ts --clear-auth
```

## 主要导出

```ts
import {
  // 核心
  WeixinSDK,
  LogLevel,
  WeixinSDKError,
  ErrorCode,

  // API
  ApiClient,
  ApiEndpoints,

  // 认证
  TokenAuthProvider,
  QrAuthProvider,
  FileTokenStore,

  // 消息
  MessageSender,
  MessageReceiver,

  // 媒体
  MediaUploader,
  MediaDownloader,

  // 加密工具
  aesEncrypt,
  aesDecrypt,
  md5,
  generateAesKey,

  // 类型
  type WeixinConfig,
  type WeixinMessage,
  type MessageItem,
  type DownloadedMedia,
  UploadMediaType,
  MessageType,
  MessageItemType,
  MessageState,
  TypingStatus,
} from '@xmccln/wechat-ilink-sdk';
```

## 配置项

`WeixinConfig` 主要字段：

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `baseUrl` | `string` | `https://ilinkai.weixin.qq.com` | iLink API 地址 |
| `cdnBaseUrl` | `string` | `https://novac2c.cdn.weixin.qq.com/c2c` | CDN 地址 |
| `timeout` | `number` | `30000` | 普通 API 超时（毫秒） |
| `longPollTimeoutMs` | `number` | `35000` | `getupdates` 长轮询超时（毫秒） |
| `retries` | `number` | `3` | 可重试请求的重试次数 |
| `pollingInterval` | `number` | `30000` | 轮询兜底间隔（毫秒） |
| `logLevel` | `LogLevel` | `LogLevel.INFO` | 日志级别 |
| `enableConsoleLog` | `boolean` | `true` | 是否打印日志到控制台 |

## 协议要点

- 所有 API 请求为 JSON POST；CDN 上传/下载为二进制。
- 媒体加密：AES-128-ECB，随机 16 字节密钥（32 位十六进制字符串）。
- `get_updates_buf` 是跨轮询保存的游标；`errcode === -14`（会话超时）时自动重置。
- iLink v2.1+ 使用 `upload_full_url` 替代 `upload_param`，上传器已兼容两种格式。
- 接收器自动使用服务端返回的 `longpolling_timeout_ms` 调整轮询间隔。

## 开发

```bash
npm install
npm run typecheck
npm test
npm run build
```

## License

MIT
