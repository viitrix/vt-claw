import * as fs from "node:fs";
import { complete, type UserMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const BTW_TRIGGER_FILE = "/tmp/agent-btw.txt";
const MAX_TRANSCRIPT_CHARS = 14_000;
const MAX_TOOL_RESULT_CHARS = 800;

const SIDE_QUESTION_SYSTEM_PROMPT = [
	"You are answering a quick side question while the user's main pi session continues working.",
	"Use the provided session transcript only as background context.",
	"Answer directly and concisely.",
	"Prefer compact bullets or short paragraphs.",
	"If the transcript is insufficient, say that briefly instead of guessing.",
].join("\n");

type TextBlock = { type?: string; text?: string };
type ToolCallBlock = { type?: string; name?: string; arguments?: Record<string, unknown> };

type SessionEntryLike = {
	type: string;
	message?: {
		role?: string;
		content?: unknown;
		toolName?: string;
	};
};

function extractTextParts(content: unknown): string[] {
	if (typeof content === "string") {
		return [content];
	}

	if (!Array.isArray(content)) {
		return [];
	}

	const textParts: string[] = [];
	for (const part of content) {
		if (!part || typeof part !== "object") continue;
		const block = part as TextBlock;
		if (block.type === "text" && typeof block.text === "string") {
			textParts.push(block.text);
		}
	}
	return textParts;
}

function extractToolCalls(content: unknown): string[] {
	if (!Array.isArray(content)) {
		return [];
	}

	const toolCalls: string[] = [];
	for (const part of content) {
		if (!part || typeof part !== "object") continue;
		const block = part as ToolCallBlock;
		if (block.type !== "toolCall" || typeof block.name !== "string") continue;
		toolCalls.push(`Assistant called tool ${block.name} with ${JSON.stringify(block.arguments ?? {})}`);
	}
	return toolCalls;
}

function clip(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	return `${text.slice(0, maxChars)}\n...[truncated]`;
}

function buildTranscriptText(entries: SessionEntryLike[]): string {
	const relevantEntries = entries.filter((entry) => entry.type === "message").slice(-20);
	const sections: string[] = [];

	for (const entry of relevantEntries) {
		const message = entry.message;
		if (!message?.role) continue;

		const role = message.role;
		const text = extractTextParts(message.content).join("\n").trim();
		const lines: string[] = [];

		switch (role) {
			case "user":
				if (text) lines.push(`User: ${text}`);
				break;
			case "assistant":
				if (text) lines.push(`Assistant: ${text}`);
				lines.push(...extractToolCalls(message.content));
				break;
			case "toolResult":
				if (text) {
					const toolName = message.toolName ?? "tool";
					lines.push(`Tool result from ${toolName}: ${clip(text, MAX_TOOL_RESULT_CHARS)}`);
				}
				break;
			case "bashExecution":
				if (text) lines.push(`User bash output: ${clip(text, MAX_TOOL_RESULT_CHARS)}`);
				break;
			case "custom":
				if (text) lines.push(`Extension message: ${text}`);
				break;
			case "branchSummary":
			case "compactionSummary":
				if (text) lines.push(`Summary: ${text}`);
				break;
		}

		if (lines.length > 0) {
			sections.push(lines.join("\n"));
		}
	}

	const transcript = sections.join("\n\n");
	if (transcript.length <= MAX_TRANSCRIPT_CHARS) return transcript;
	return `...[earlier session context omitted]\n\n${transcript.slice(-MAX_TRANSCRIPT_CHARS)}`;
}

function buildSideQuestionPrompt(question: string, transcript: string): string {
	return [
		"Current pi session transcript:",
		"<session>",
		transcript || "(No useful session transcript found.)",
		"</session>",
		"",
		"Side question:",
		"<question>",
		question,
		"</question>",
	].join("\n");
}

function getModelLabel(ctx: ExtensionContext): string {
	if (!ctx.model) return "unknown-model";
	return `${ctx.model.provider}/${ctx.model.id}`;
}

async function askSideQuestion(question: string, ctx: ExtensionContext): Promise<string> {
	if (!ctx.model) {
		throw new Error("No model selected.");
	}

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
	if (!auth.ok) {
		throw new Error(auth.error);
	}
	if (!auth.apiKey) {
		throw new Error(`No API key available for ${getModelLabel(ctx)}.`);
	}

	const transcript = buildTranscriptText(ctx.sessionManager.getBranch() as SessionEntryLike[]);
	const userMessage: UserMessage = {
		role: "user",
		content: [{ type: "text", text: buildSideQuestionPrompt(question, transcript) }],
		timestamp: Date.now(),
	};

	const response = await complete(
		ctx.model,
		{
			systemPrompt: SIDE_QUESTION_SYSTEM_PROMPT,
			messages: [userMessage],
		},
		{
			apiKey: auth.apiKey,
			headers: auth.headers,
		},
	);

	if (response.stopReason === "aborted") {
		throw new Error("Cancelled.");
	}

	const answer = response.content
		.filter((item:any): item is { type: "text"; text: string } => item.type === "text")
		.map((item:any) => item.text)
		.join("\n")
		.trim();

	return answer || "No response received.";
}

async function startBtw(question: string, pi: ExtensionAPI, ctx: ExtensionContext) {
	if (!ctx.model) {
		return;
	}
	try {
		const answer = await askSideQuestion(question, ctx);
        pi.events.emit("btw:answer", answer);
	} catch (error:any) {
		pi.events.emit("btw:answer", error);
	}
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("btw", {
		description: "Answer a side question",
		handler: async (args:any, ctx:ExtensionContext) => {
			const question:string  = args.trim() || "";
			if (question.length > 0) {
				void startBtw(question, pi, ctx);
			}
		},
	});
}
