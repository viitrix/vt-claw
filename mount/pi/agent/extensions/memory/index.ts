/**
 * Memory Extension
 *
 * Plain-Markdown memory system inspired by OpenClaw's approach.
 * No embeddings, no vector search — just files on disk injected into context.
 *
 * Layout (under ~/.pi/agent/memory/):
 *   MEMORY.md              — curated long-term memory (decisions, preferences, durable facts)
 *   daily/YYYY-MM-DD.md    — daily append-only log (today + yesterday loaded at session start)
 *
 * Tools:
 *   memory_write  — write to MEMORY.md or daily log
 *   memory_read   — read any memory file or list daily logs
 *
 * Context injection:
 *   - MEMORY.md + today's + yesterday's daily logs injected into every turn
 *
 * Dashboard widget:
 *   - Auto-generated "Last 24h" summary from session metadata (titles, timestamps, costs)
 *   - Rebuilt every 15 minutes in the background
 *   - Shown on session_start and session_switch (so /new gets it too)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

import {
	type MemoryConfig,
	buildConfig,
	todayStr,
	nowTimestamp,
	shortSessionId,
	readFileSafe,
	dailyPath,
	ensureDirs,
	buildMemoryContext,
	searchMemory,
} from "./lib.ts";

const config:MemoryConfig = buildConfig();

function gitCommit(message: string) {
	if (!config.autocommit) return;
	try {
		execFileSync("git", ["add", "-A"], { cwd: config.memoryDir, stdio: "ignore", timeout: 5000 });
		execFileSync("git", ["commit", "-m", message, "--allow-empty-message", "--no-verify"], { cwd: config.memoryDir, stdio: "ignore", timeout: 5000 });
	} catch {
		// git not available or not a repo — silently skip
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event, _ctx) => {
		const memoryContext = buildMemoryContext(config);
		if (!memoryContext) return;

		const memoryInstructions = [
			"\n\n## Memory",
			"The following memory files have been loaded. Use the memory_write tool to persist important information.",
			"- Decisions, preferences, and durable facts \u2192 MEMORY.md",
			"- Day-to-day notes and running context \u2192 daily/<YYYY-MM-DD>.md",
			'- If someone says "remember this," write it immediately.',
			"",
			"### Daily Log Rule",
			"After meaningful interactions, call memory_write(target='daily') with a brief 1-2 sentence summary.",
			"**Log when:** task completed, decision made, bug fixed, new info discovered, config changed.",
			"**Skip when:** greetings, goodbyes, chitchat, simple acks, trivial factual questions.",
			"Log the outcome, not the question (e.g. \"Debugged import error \u2014 missing __init__.py\" not \"User asked about imports\").",
			"",
			memoryContext,
		].join("\n");

		return {
			systemPrompt: event.systemPrompt + memoryInstructions,
		};
	});

	pi.on("session_before_compact", async (_event, ctx) => {
		const memoryContext = buildMemoryContext(config);
		const hasMemory = memoryContext.length > 0;
		if (hasMemory) {
            console.error("Memory files available \u2014 consider persisting important context before compaction", "info");
		}
	});

	// memory_write tool
	pi.registerTool({
		name: "memory_write",
		label: "Memory Write",
		description: [
			"Write to memory files. Three targets:",
			"- 'long_term': Write to MEMORY.md (curated durable facts, decisions, preferences). Mode: 'append' or 'overwrite'.",
			"- 'daily': Append to today's daily log (daily/<YYYY-MM-DD>.md). Always appends.",
			"- 'note': Create or update a file in notes/ (e.g. lessons.md, self-review.md). Pass filename. Mode: 'append' or 'overwrite'.",
			"Use this when the user asks you to remember something, or when you learn important preferences/decisions.",
		].join("\n"),
		parameters: Type.Object({
			target: StringEnum(["long_term", "daily", "note"] as const, {
				description: "Where to write: 'long_term' for MEMORY.md, 'daily' for today's daily log, 'note' for notes/<filename>",
			}),
			content: Type.String({ description: "Content to write (Markdown)" }),
			mode: Type.Optional(
				StringEnum(["append", "overwrite"] as const, {
					description: "Write mode. Default: 'append'. Daily always appends.",
				}),
			),
			filename: Type.Optional(
				Type.String({ description: "Filename for 'note' target (e.g. 'lessons.md')" }),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			ensureDirs(config);
			const { target, content, mode, filename } = params;
			const sid = shortSessionId(ctx.sessionManager.getSessionId());
			const ts = nowTimestamp();

			if (target === "note") {
				if (!filename) {
					return { content: [{ type: "text", text: "Error: 'filename' is required for target 'note'." }], details: {} };
				}
				const safe = path.basename(filename);
				const filePath = path.join(config.notesDir, safe);
				const existing = readFileSafe(filePath) ?? "";

				if (mode === "overwrite") {
					const stamped = `<!-- last updated: ${ts} [${sid}] -->\n${content}`;
					fs.writeFileSync(filePath, stamped, "utf-8");
					gitCommit(`note: ${safe}`);
					return {
						content: [{ type: "text", text: `Wrote notes/${safe}` }],
						details: { path: filePath, target, mode: "overwrite", sessionId: sid, timestamp: ts },
					};
				}

				const separator = existing.trim() ? "\n\n" : "";
				const stamped = `<!-- ${ts} [${sid}] -->\n${content}`;
				fs.writeFileSync(filePath, existing + separator + stamped, "utf-8");
				gitCommit(`note: ${safe}`);
				return {
					content: [{ type: "text", text: `Appended to notes/${safe}` }],
					details: { path: filePath, target, mode: "append", sessionId: sid, timestamp: ts },
				};
			}

			if (target === "daily") {
				const filePath = dailyPath(config.dailyDir, todayStr());
				const existing = readFileSafe(filePath) ?? "";

				const separator = existing.trim() ? "\n\n" : "";
				const stamped = `<!-- ${ts} [${sid}] -->\n${content}`;
				fs.writeFileSync(filePath, existing + separator + stamped, "utf-8");
				gitCommit(`daily: ${todayStr()}`);
				return {
					content: [{ type: "text", text: `Appended to daily/${todayStr()}.md` }],
					details: { path: filePath, target, mode: "append", sessionId: sid, timestamp: ts },
				};
			}

			// long_term
			const existing = readFileSafe(config.memoryFile) ?? "";

			if (mode === "overwrite") {
				const stamped = `<!-- last updated: ${ts} [${sid}] -->\n${content}`;
				fs.writeFileSync(config.memoryFile, stamped, "utf-8");
				gitCommit("memory: overwrite");
				return {
					content: [{ type: "text", text: `Overwrote MEMORY.md` }],
					details: { path: config.memoryFile, target, mode: "overwrite", sessionId: sid, timestamp: ts },
				};
			}

			const separator = existing.trim() ? "\n\n" : "";
			const stamped = `<!-- ${ts} [${sid}] -->\n${content}`;
			fs.writeFileSync(config.memoryFile, existing + separator + stamped, "utf-8");
			gitCommit("memory: append");
			return {
				content: [{ type: "text", text: `Appended to MEMORY.md` }],
				details: { path: config.memoryFile, target, mode: "append", sessionId: sid, timestamp: ts },
			};
		},
	});

	// memory_read tool
	pi.registerTool({
		name: "memory_read",
		label: "Memory Read",
		description: [
			"Read a memory file. Targets:",
			"- 'long_term': Read MEMORY.md",
			"- 'daily': Read a specific day's log (default: today). Pass date as YYYY-MM-DD.",
			"- 'file': Read any file by name (e.g. 'SOUL.md'). Pass filename.",
			"- 'note': Read a file from notes/ (e.g. 'lessons.md'). Pass filename.",
			"- 'list': List all files in the memory directory.",
		].join("\n"),
		parameters: Type.Object({
			target: StringEnum(["long_term", "daily", "file", "note", "list"] as const, {
				description: "What to read",
			}),
			date: Type.Optional(
				Type.String({ description: "Date for daily log (YYYY-MM-DD). Default: today." }),
			),
			filename: Type.Optional(
				Type.String({ description: "Filename for 'file' target (e.g. 'lessons.md', 'SOUL.md')" }),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			ensureDirs(config);
			const { target, date, filename } = params;

			if (target === "list") {
				const sections: string[] = [];
				try {
					const rootFiles = fs.readdirSync(config.memoryDir).filter(f => f.endsWith(".md") || f.endsWith(".json")).sort();
					if (rootFiles.length > 0) sections.push(`Files:\n${rootFiles.map(f => `- ${f}`).join("\n")}`);
				} catch {}
				try {
					const noteFiles = fs.readdirSync(config.notesDir).filter(f => f.endsWith(".md")).sort();
					if (noteFiles.length > 0) sections.push(`Notes:\n${noteFiles.map(f => `- notes/${f}`).join("\n")}`);
				} catch {}
				try {
					const dailyFiles = fs.readdirSync(config.dailyDir).filter(f => f.endsWith(".md")).sort().reverse();
					if (dailyFiles.length > 0) sections.push(`Daily logs (${dailyFiles.length}):\n${dailyFiles.slice(0, 10).map(f => `- daily/${f}`).join("\n")}${dailyFiles.length > 10 ? `\n  ... and ${dailyFiles.length - 10} more` : ""}`);
				} catch {}
				if (sections.length === 0) {
					return { content: [{ type: "text", text: "Memory directory is empty." }], details: {} };
				}
				return { content: [{ type: "text", text: sections.join("\n\n") }], details: {} };
			}

			if (target === "file") {
				if (!filename) {
					return { content: [{ type: "text", text: "Error: 'filename' is required for target 'file'." }], details: {} };
				}
				const safe = path.basename(filename);
				const filePath = path.join(config.memoryDir, safe);
				const content = readFileSafe(filePath);
				if (!content) {
					return { content: [{ type: "text", text: `File not found: ${safe}` }], details: {} };
				}
				return { content: [{ type: "text", text: content }], details: { path: filePath, filename: safe } };
			}

			if (target === "note") {
				if (!filename) {
					return { content: [{ type: "text", text: "Error: 'filename' is required for target 'note'." }], details: {} };
				}
				const safe = path.basename(filename);
				const filePath = path.join(config.notesDir, safe);
				const content = readFileSafe(filePath);
				if (!content) {
					return { content: [{ type: "text", text: `Note not found: notes/${safe}` }], details: {} };
				}
				return { content: [{ type: "text", text: content }], details: { path: filePath, filename: `notes/${safe}` } };
			}

			if (target === "daily") {
				const d = date ?? todayStr();
				const filePath = dailyPath(config.dailyDir, d);
				const content = readFileSafe(filePath);
				if (!content) {
					return { content: [{ type: "text", text: `No daily log for ${d}.` }], details: {} };
				}
				return {
					content: [{ type: "text", text: content }],
					details: { path: filePath, date: d },
				};
			}

			// long_term
			const content = readFileSafe(config.memoryFile);
			if (!content) {
				return { content: [{ type: "text", text: "MEMORY.md is empty or does not exist." }], details: {} };
			}
			return {
				content: [{ type: "text", text: content }],
				details: { path: config.memoryFile },
			};
		},
	});

	// memory_search tool
	pi.registerTool({
		name: "memory_search",
		label: "Memory Search",
		description: [
			"Search across all memory files (MEMORY.md, daily logs, notes/, and any other .md files).",
			"Matches filenames and file contents. Case-insensitive keyword search.",
			"Returns matching files and lines with paths.",
		].join("\n"),
		parameters: Type.Object({
			query: Type.String({ description: "Search query (case-insensitive substring match)" }),
			max_results: Type.Optional(
				Type.Number({ description: "Maximum results to return (default: 20)", default: 20 }),
			),
		}),
		async execute(_toolCallId, params) {
			ensureDirs(config);
			const { query, max_results } = params;
			const limit = max_results ?? 20;

			const result = searchMemory(config, query, limit);

			if (result.fileMatches.length === 0 && result.lineResults.length === 0) {
				return { content: [{ type: "text", text: `No results for "${query}".` }], details: {} };
			}

			const parts: string[] = [];
			if (result.fileMatches.length > 0) {
				parts.push(`Files matching "${query}":\n${result.fileMatches.map(f => `- ${f}`).join("\n")}`);
			}
			if (result.lineResults.length > 0) {
				parts.push(`Content matches:\n${result.lineResults.map(r => `${r.file}:${r.line}: ${r.text}`).join("\n")}`);
			}

			return {
				content: [{ type: "text", text: parts.join("\n\n") }],
				details: { query, fileMatches: result.fileMatches.length, lineMatches: result.lineResults.length },
			};
		},
	});
}