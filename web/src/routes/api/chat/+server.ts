import { registerWebUser } from "$lib/server/claw-client";
import { ClawChatModel } from "$lib/server/ai/claw-model.js";
import { generateTitleFromUserMessage } from "$lib/server/ai/utils";
import {
  deleteChatById,
  getChatById,
  saveChat,
  saveMessages,
} from "$lib/server/db/queries.js";
import type { Chat } from "$lib/server/db/schema";
import {
  getMostRecentUserMessage,
  getTrailingMessageId,
} from "$lib/utils/chat.js";
import { allowAnonymousChats } from "$lib/utils/constants.js";
import { error } from "@sveltejs/kit";
import {
  appendResponseMessages,
  createDataStreamResponse,
  smoothStream,
  streamText,
  type UIMessage,
} from "ai";
import { ok, safeTry } from "neverthrow";

export async function POST({ request, url, locals: { user } }) {
  // TODO: zod?
  const {
    id,
    messages,
    role,
  }: { id: string; messages: UIMessage[]; role: string } = await request.json();

  if (!role) {
    error(400, "role is required");
  }

  if (!user && !allowAnonymousChats) {
    error(401, "Unauthorized");
  }

  const userMessage = getMostRecentUserMessage(messages);

  if (!userMessage) {
    error(400, "No user message found");
  }

  // Ensure attachment URLs are absolute (historical data may have relative paths)
  for (const msg of messages) {
    if (msg.experimental_attachments) {
      for (const att of msg.experimental_attachments) {
        if (
          att.url &&
          !att.url.startsWith("http") &&
          !att.url.startsWith("data:")
        ) {
          att.url = `${url.origin}${att.url.startsWith("/") ? "" : "/"}${att.url}`;
        }
      }
    }
  }

  if (user) {
    await registerWebUser(user.id, role);

    await safeTry(async function* () {
      let chat: Chat;
      const chatResult = await getChatById({ id });
      if (chatResult.isErr()) {
        if (chatResult.error._tag !== "DbEntityNotFoundError") {
          return chatResult;
        }
        const title = generateTitleFromUserMessage({ message: userMessage });
        chat = yield* saveChat({ id, userId: user.id, title });
      } else {
        chat = chatResult.value;
      }

      if (chat.userId !== user.id) {
        error(403, "Forbidden");
      }

      yield* saveMessages({
        messages: [
          {
            chatId: id,
            id: userMessage.id,
            role: "user",
            parts: userMessage.parts,
            attachments: userMessage.experimental_attachments ?? [],
            createdAt: new Date(),
          },
        ],
      });

      return ok(undefined);
    }).orElse(() =>
      error(500, "An error occurred while processing your request"),
    );
  }

  return createDataStreamResponse({
    execute: (dataStream) => {
      const result = streamText({
        model: new ClawChatModel(user?.id ?? "anonymous", role),
        messages,
        experimental_generateMessageId: () =>
          globalThis.crypto?.randomUUID
            ?.bind(globalThis.crypto)()
            ?.toString() ??
          `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        onFinish: async ({ response }) => {
          if (!user) return;
          const assistantId = getTrailingMessageId({
            messages: response.messages.filter(
              (message) => message.role === "assistant",
            ),
          });

          if (!assistantId) {
            throw new Error("No assistant message found!");
          }

          const [, assistantMessage] = appendResponseMessages({
            messages: [userMessage],
            responseMessages: response.messages,
          });

          await saveMessages({
            messages: [
              {
                id: assistantId,
                chatId: id,
                role: assistantMessage.role,
                parts: assistantMessage.parts,
                attachments: assistantMessage.experimental_attachments ?? [],
                createdAt: new Date(),
              },
            ],
          });
        },
        experimental_telemetry: {
          isEnabled: true,
          functionId: "stream-text",
        },
      });

      result.consumeStream();

      result.mergeIntoDataStream(dataStream, {
        sendReasoning: true,
      });
    },
    onError: (e) => {
      console.error(e);
      return "Oops!";
    },
  });
}

export async function DELETE({ locals: { user }, request }) {
  // TODO: zod
  const { id }: { id: string } = await request.json();
  if (!user) {
    error(401, "Unauthorized");
  }

  return await getChatById({ id })
    .andTee((chat) => {
      if (chat.userId !== user.id) {
        error(403, "Forbidden");
      }
    })
    .andThen(deleteChatById)
    .match(
      () => new Response("Chat deleted", { status: 200 }),
      () => error(500, "An error occurred while processing your request"),
    );
}
