# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VT-Claw Web is an AI chatbot frontend built with **SvelteKit 5** (Svelte 5 runes syntax). It acts as a web client that proxies chat requests to a separate backend service (the "Claw" server) via SSE-based streaming. The app supports email/password auth, WeChat QR code login, and an anonymous walkie-talkie voice chat mode.

## Commands

- `pnpm dev` — Start dev server (listens on 0.0.0.0)
- `pnpm build` — Production build
- `pnpm preview` — Preview production build
- `pnpm check` — TypeScript checking via svelte-check
- `pnpm lint` — Prettier check + ESLint
- `pnpm format` — Format with Prettier
- `pnpm db:push` — Push Drizzle schema changes to SQLite

## Architecture

### Backend Proxy Pattern

The web app does **not** call LLM APIs directly. Instead, `src/lib/server/claw-client.ts` proxies all AI interactions to a Claw backend (`CLAW_API_URL`, default `http://localhost:3000`). The backend handles web chat (`/api/web-chat`), talkie chat (`/api/talkie-chat`), WeChat login flows, file serving, and role management.

The `ClawChatModel` class (`src/lib/server/ai/claw-model.ts`) implements the Vercel AI SDK `LanguageModelV1` interface, adapting the Claw backend's SSE stream into the AI SDK's streaming protocol. This allows the chat UI to use `streamText()` from the `ai` package while the actual model execution happens remotely.

### Database

- **SQLite** via `@libsql/client` + **Drizzle ORM** — stored at `data/chatbot.db`
- Schema in `src/lib/server/db/schema.ts` — four tables: `User`, `Session`, `Chat`, `Message`
- All DB queries in `src/lib/server/db/queries.ts` return `ResultAsync` from the `neverthrow` library (no exceptions thrown)
- Error types use a tagged union pattern: `TaggedError` base class → `DbEntityNotFoundError | DbInternalError`

### Authentication

- Session-based auth using `@oslojs/crypto` for token hashing — see `src/lib/server/auth/`
- `hooks.server.ts` validates session cookies on every request via SvelteKit's `sequence` handle
- Routes under `src/routes/(auth)/` handle signup/signin with Zod validation
- `App.Locals` provides `user` and `session` to all server-side code

### Routes

- `/` — Landing page (unauthenticated) or redirect to chat
- `/chat` — Main chat interface (layout loads user + chat history)
- `/chat/[chatId]` — Individual chat conversation
- `/walkie` — Walkie-talkie voice chat (CSR only, no auth required, in-memory message buffer)
- `/weixin` — WeChat QR code login flow
- `/api/chat` — POST to stream AI responses, DELETE to remove chats
- `/api/files/upload` and `/api/files/download/[...path]` — File upload/download proxied to Claw backend's share folder
- `/api/roles`, `/api/wxlogin`, `/api/qrcode`, `/api/qrstatus` — WeChat login proxies to Claw backend

### UI

- **shadcn-svelte** component library (configured via `components.json`)
- **Tailwind CSS v4** with `@tailwindcss/vite` plugin
- **bits-ui** for headless UI primitives
- Svelte 5 runes (`$state`, `$effect`, `$derived`) used throughout — no legacy Svelte stores
- Custom fonts (Geist) loaded from `/static/fonts/`

### Key Conventions

- Package manager is **pnpm** (see `packageManager` field in package.json)
- `neverthrow` `ResultAsync`/`safeTry` used for all fallible operations instead of try/catch
- Svelte 5 runes syntax exclusively — use `$state()`, `$effect()`, `$derived()` not legacy reactive declarations
- Unused variables prefixed with `_` (enforced by ESLint)
- API routes use `@sveltejs/kit` error helper, not thrown Response objects
- File uploads restricted to JPEG/PNG, max 5MB (validated with Zod in upload route)
