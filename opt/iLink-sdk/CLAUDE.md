# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`wechat-ilink-sdk` (published as `wechat-ilink-sdk`) is a TypeScript SDK for the WeChat iLink bot protocol. It provides QR login, token auth, long-polling message receive, text/media sending, CDN upload with AES-128-ECB encryption, and inbound media download/decryption. Zero runtime dependencies — uses only Node.js built-ins (`crypto`, `fs`, `path`, `os`, `fetch`).

## Commands

```bash
npm install              # install dependencies
npm run typecheck        # tsc --noEmit
npm test                 # run all tests (vitest run)
npm run test:watch       # vitest in watch mode
npm run test -- tests/api/client.test.ts  # run a single test file
npm run build            # rollup -c → dist/index.cjs + dist/index.mjs + declarations
```

Node >= 18 required.

## Architecture

Entry point: `src/index.ts` re-exports everything.

**Core layer** (`src/core/`):
- `client.ts` — `WeixinSDK` orchestrator. Composes all subsystems, forwards auth/message events, exposes convenience methods (`sendText`, `sendMedia`, `onMessage`, etc.). Constructor wires up `ApiClient` → `ApiEndpoints` → `MessageSender`/`MessageReceiver`/`MediaUploader`/`MediaDownloader`.
- `types.ts` — `WeixinConfig`, `AuthResult`, `LogLevel`, default URLs.
- `errors.ts` — `WeixinSDKError` with `ErrorCode` enum (auth/network/api/media/config categories).

**API layer** (`src/api/`):
- `client.ts` — `ApiClient`: low-level HTTP with retry+exponential backoff, auto-attaches `base_info`, Bearer token auth, timeout via AbortController.
- `endpoints.ts` — `ApiEndpoints`: wraps each iLink CGI (`/ilink/bot/getupdates`, `sendmessage`, `getuploadurl`, `sendtyping`, `getconfig`).
- `types.ts` — Protocol types mirroring the iLink proto definitions. Key types: `WeixinMessage`, `MessageItem`, `GetUpdatesReq/Resp`, `SendMessageReq`. Also contains helper functions (`getMessageText`, `findMediaItem`, `hasImage`, etc.) and constants (`UploadMediaType`, `MessageType`, `MessageItemType`, `MessageState`).

**Auth** (`src/auth/`):
- `interfaces.ts` — `AuthProvider` interface and `QrAuthEvents` event types.
- `providers.ts` — `TokenAuthProvider`: wraps a pre-obtained token.
- `qr-auth.ts` — `QrAuthProvider`: QR code flow (get QR → poll status → extract token). Has `fromConfig()` factory.
- `token-store.ts` — `FileTokenStore`: file-based token persistence.

**Messaging** (`src/messaging/`):
- `sender.ts` — `MessageSender`: builds `WeixinMessage` payloads for text and media (encrypts media via `MediaUploader`, constructs CDN media references).
- `receiver.ts` — `MessageReceiver`: long-polls `getUpdates`, emits `'message'` events, manages `get_updates_buf` cursor. Resets cursor on `errcode === -14` (session timeout).

**Media** (`src/media/`):
- `uploader.ts` — `MediaUploader`: reads file → AES-128-ECB encrypt → get upload URL → POST to CDN → returns `UploadResult` with download param and key.
- `downloader.ts` — `MediaDownloader`: fetches encrypted CDN blob → AES-128-ECB decrypt → writes to temp file. Per-type methods (`downloadImage`, `downloadVideo`, `downloadFile`, `downloadVoice`) plus `downloadFirstMedia`.
- `crypto.ts` — `generateAesKey`, `aesEncrypt`, `aesDecrypt` (AES-128-ECB), `md5`.
- `mime.ts` — extension-to-MIME mapping.
- `types.ts` — `UploadOptions`, `UploadResult`, `UploadMediaType` re-export.

**Utilities** (`src/utils/`):
- `event-emitter.ts` — simple typed EventEmitter base class.
- `logger.ts` — `Logger` with log levels.

## Build Output

Rollup produces dual format: CJS (`dist/index.cjs`) and ESM (`dist/index.mjs`) with TypeScript declarations in `dist/`. The package uses `exports` map in `package.json` for conditional resolution.

## Key Protocol Details

- API base: `https://ilinkai.weixin.qq.com`, CDN base: `https://novac2c.cdn.weixin.qq.com/c2c`
- All API requests are JSON POST; CDN upload/download is binary.
- Media encryption: AES-128-ECB with random 16-byte key (32 hex chars).
- `get_updates_buf` is a cursor that must be preserved across polls; reset on `errcode -14`.
- iLink v2.1+ returns `upload_full_url` instead of `upload_param` in getUploadUrl response — uploader handles both.
- Replies should echo back the inbound `context_token`.
