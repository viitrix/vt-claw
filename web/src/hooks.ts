import { ChatHistory } from "$lib/hooks/chat-history.svelte";
import type { Transport } from "@sveltejs/kit";

export const transport: Transport = {
  ChatHistory: {
    encode: (value) => value instanceof ChatHistory && value.chats,
    decode: (value) => new ChatHistory(value),
  },
};
