import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { talkieChat } from "$lib/server/claw-client";

export type TalkieMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

const messages: TalkieMessage[] = [];
const MAX_MESSAGES = 500;

function pushMessage(
  role: "user" | "assistant",
  content: string,
): TalkieMessage {
  const msg: TalkieMessage = {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: Date.now(),
  };
  messages.push(msg);
  if (messages.length > MAX_MESSAGES) {
    messages.splice(0, messages.length - MAX_MESSAGES);
  }
  return msg;
}

/**
 * POST /walkie/api/asr
 * Forward ASR text to claw /api/talkie, store user + assistant messages.
 * Body: { text: string }
 */
export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { text } = body as { text?: string };

  if (!text) {
    return json({ error: "text is required" }, { status: 400 });
  }

  pushMessage("user", text);

  try {
    const reply = await talkieChat(text);
    const assistantMsg = pushMessage("assistant", reply);
    return json({ status: "ok", reply, assistantId: assistantMsg.id });
  } catch (err) {
    console.error("[walkie/asr] talkieChat failed:", err);
    return json({ status: "error", error: String(err) }, { status: 502 });
  }
};

/**
 * GET /walkie/api/asr?after=<id>
 * Poll for talkie messages after the given message id.
 */
export const GET: RequestHandler = async ({ url }) => {
  const afterId = url.searchParams.get("after");

  if (!afterId) {
    return json(messages);
  }

  const idx = messages.findIndex((m) => m.id === afterId);
  if (idx === -1) {
    return json(messages);
  }

  return json(messages.slice(idx + 1));
};
