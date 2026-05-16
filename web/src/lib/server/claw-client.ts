import { env } from "$env/dynamic/private";

const BASE_URL = env.CLAW_API_URL || "http://localhost:3000";

// --------------- register web user ---------------

const notifiedUsers = new Set<string>();

export async function registerWebUser(uid: string, role: string) {
  const key = role ? `${uid}:${role}` : uid;
  if (notifiedUsers.has(key)) return;
  notifiedUsers.add(key);

  try {
    const params = new URLSearchParams({ uid });
    if (role) params.set("role", role);
    await fetch(`${BASE_URL}/api/register-web-user?${params}`);
  } catch (err) {
    console.error("[claw-client] register-web-user call error:", err);
  }
}

// --------------- WeChat login ---------------

export type RoleInfo = {
  name: string;
  displayName: string;
  description: string;
};
export type RolesResp = { status: string; roles: RoleInfo[] };

export type WxLoginResp = {
  status: string;
  qrcode?: string;
  rid?: string;
  error?: string;
};
export type QrStatusResp = { status: string };

export async function fetchRoles(channel: string): Promise<RolesResp> {
  const resp = await fetch(
    `${BASE_URL}/api/roles?channel=${encodeURIComponent(channel)}`,
  );
  return resp.json();
}

export async function startWxLogin(role: string): Promise<WxLoginResp> {
  const resp = await fetch(
    `${BASE_URL}/api/wxlogin?role=${encodeURIComponent(role)}`,
    { method: "POST" },
  );
  return resp.json();
}

export async function getQrStatus(rid: string): Promise<QrStatusResp> {
  const resp = await fetch(
    `${BASE_URL}/api/qrstatus?rid=${encodeURIComponent(rid)}`,
  );
  return resp.json();
}

export async function getQrcodeImage(
  rid: string,
): Promise<{ data: ArrayBuffer; contentType: string } | null> {
  const resp = await fetch(
    `${BASE_URL}/api/qrcode?rid=${encodeURIComponent(rid)}`,
  );
  if (!resp.ok) return null;
  const contentType = resp.headers.get("content-type") || "image/png";
  const data = await resp.arrayBuffer();
  return { data, contentType };
}

// --------------- Web chat ---------------

export type WebChatEvent =
  | { type: "text_delta"; delta: string }
  | { type: "tool_start"; toolName: string }
  | { type: "tool_end"; toolName: string; isError: boolean }
  | { type: "file"; relativePath: string }
  | { type: "done" };

/** Stream webchat SSE events via callback. */
export async function streamWebChat(
  uid: string,
  text: string,
  onEvent: (event: WebChatEvent) => void,
  role: string,
): Promise<void> {
  const body: Record<string, string> = { uid, text, role };

  const resp = await fetch(`${BASE_URL}/api/web-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    throw new Error(`claw webchat returned ${resp.status}`);
  }
  if (!resp.body) return;

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(trimmed.slice(6));
        onEvent(event);
      } catch {
        // skip malformed
      }
    }
  }
}

/** Collect full webchat response as a single string. */
export async function collectWebChat(
  uid: string,
  text: string,
  role: string,
): Promise<string> {
  let result = "";
  await streamWebChat(
    uid,
    text,
    (event) => {
      if (event.type === "text_delta") result += event.delta;
    },
    role,
  );
  return result;
}

// --------------- Talkie chat ---------------

export async function talkieChat(text: string): Promise<string> {
  const resp = await fetch(`${BASE_URL}/api/talkie-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`claw talkie returned ${resp.status}: ${body}`);
  }
  if (!resp.body) return "";

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(trimmed.slice(6));
        if (event.type === "text_delta") result += event.delta;
      } catch {
        // skip malformed
      }
    }
  }

  return result;
}

// --------------- Share folder ---------------

const shareFolderCache = new Map<string, string>();

export async function getShareFolder(
  uid: string,
  channel = "web",
): Promise<string | null> {
  const cacheKey = `${uid}:${channel}`;
  const cached = shareFolderCache.get(cacheKey);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({ uid, channel });
    const resp = await fetch(`${BASE_URL}/api/share-folder?${params}`);
    if (!resp.ok) return null;
    const data = (await resp.json()) as { status: string; folder?: string };
    const folder = data.folder ?? null;
    if (folder) shareFolderCache.set(cacheKey, folder);
    return folder;
  } catch {
    return null;
  }
}
