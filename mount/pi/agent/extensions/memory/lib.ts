/**
 * Pure logic extracted from the memory extension for testability.
 * No pi API dependencies — just file I/O and string manipulation.
 */

import * as fs from "node:fs";
import * as path from "node:path";

// --- Config ---

export interface MemoryConfig {
	memoryDir: string;
	memoryFile: string;
	dailyDir: string;
	notesDir: string;
	contextFiles: string[];
	autocommit: boolean;
}

export function buildConfig(env: Record<string, string | undefined> = process.env): MemoryConfig {
	const memoryDir = env.PI_MEMORY_DIR ?? path.join(env.HOME ?? "~", ".pi", "agent", "memory");
	const dailyDir = env.PI_DAILY_DIR ?? path.join(memoryDir, "daily");
	const contextFiles = (env.PI_CONTEXT_FILES ?? "")
		.split(",")
		.map(f => f.trim())
		.filter(Boolean);
	const autocommit = env.PI_AUTOCOMMIT === "1" || env.PI_AUTOCOMMIT === "true";

	return {
		memoryDir,
		memoryFile: path.join(memoryDir, "MEMORY.md"),
		dailyDir,
		notesDir: path.join(memoryDir, "notes"),
		contextFiles,
		autocommit,
	};
}

// --- Date/time helpers ---

export function todayStr(): string {
	return new Date().toISOString().slice(0, 10);
}

export function yesterdayStr(): string {
	const d = new Date();
	d.setDate(d.getDate() - 1);
	return d.toISOString().slice(0, 10);
}

export function nowTimestamp(): string {
	return new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
}

export function shortSessionId(sessionId: string): string {
	return sessionId.slice(0, 8);
}

// --- File helpers ---

export function readFileSafe(filePath: string): string | null {
	try {
		return fs.readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}
}

export function dailyPath(dailyDir: string, date: string): string {
	return path.join(dailyDir, `${date}.md`);
}

export function ensureDirs(config: MemoryConfig): void {
	fs.mkdirSync(config.memoryDir, { recursive: true });
	fs.mkdirSync(config.dailyDir, { recursive: true });
	fs.mkdirSync(config.notesDir, { recursive: true });
}

// --- Memory context builder ---

export function buildMemoryContext(config: MemoryConfig): string {
	ensureDirs(config);
	const sections: string[] = [];

	for (const fileName of config.contextFiles) {
		const filePath = path.join(config.memoryDir, fileName);
		const content = readFileSafe(filePath);
		if (content?.trim()) {
			sections.push(`## ${fileName}\n\n${content.trim()}`);
		}
	}

	const longTerm = readFileSafe(config.memoryFile);
	if (longTerm?.trim()) {
		sections.push(`## MEMORY.md (long-term)\n\n${longTerm.trim()}`);
	}

	const today = todayStr();
	const yesterday = yesterdayStr();

	const todayContent = readFileSafe(dailyPath(config.dailyDir, today));
	if (todayContent?.trim()) {
		sections.push(`## Daily log: ${today} (today)\n\n${todayContent.trim()}`);
	}

	const yesterdayContent = readFileSafe(dailyPath(config.dailyDir, yesterday));
	if (yesterdayContent?.trim()) {
		sections.push(`## Daily log: ${yesterday} (yesterday)\n\n${yesterdayContent.trim()}`);
	}

	if (sections.length === 0) {
		return "";
	}

	return `# Memory\n\n${sections.join("\n\n---\n\n")}`;
}

// --- Search ---

export interface SearchResult {
	fileMatches: string[];
	lineResults: { file: string; line: number; text: string }[];
}

export function searchMemory(config: MemoryConfig, query: string, maxResults: number = 20): SearchResult {
	const needle = query.toLowerCase();
	const fileMatches: string[] = [];
	const lineResults: { file: string; line: number; text: string }[] = [];

	function searchFile(filePath: string, displayName: string) {
		if (displayName.toLowerCase().includes(needle) && !fileMatches.includes(displayName)) {
			fileMatches.push(displayName);
		}
		const content = readFileSafe(filePath);
		if (!content) return;
		const lines = content.split("\n");
		for (let i = 0; i < lines.length && lineResults.length < maxResults; i++) {
			if (lines[i].toLowerCase().includes(needle)) {
				lineResults.push({ file: displayName, line: i + 1, text: lines[i].trimEnd() });
			}
		}
	}

	function searchDir(dir: string, prefix: string) {
		try {
			const files = fs.readdirSync(dir).filter(f => f.endsWith(".md")).sort();
			for (const f of files) {
				if (lineResults.length >= maxResults) break;
				searchFile(path.join(dir, f), prefix ? `${prefix}/${f}` : f);
			}
		} catch {}
	}

	searchDir(config.memoryDir, "");
	searchDir(config.dailyDir, "daily");
	searchDir(config.notesDir, "notes");

	return { fileMatches, lineResults };
}