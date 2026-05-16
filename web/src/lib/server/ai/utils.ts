import type { Message } from "ai";

export function generateTitleFromUserMessage({
  message,
}: {
  message: Message;
}): string {
  const textParts = message.parts
    ?.filter((part) => part.type === "text")
    .map((part) => (part as { type: "text"; text: string }).text.trim());

  const fullText = textParts?.join(" ").trim() ?? "";

  if (!fullText) {
    return "New Chat";
  }

  // Extract the first sentence (up to sentence-ending punctuation or newline)
  const match = fullText.match(/^[^.!?。！？\n]+[.!?。！？]?/);
  const firstSentence = match ? match[0].trim() : fullText;

  // Truncate to 80 characters
  if (firstSentence.length > 80) {
    return firstSentence.slice(0, 77) + "...";
  }

  return firstSentence;
}
