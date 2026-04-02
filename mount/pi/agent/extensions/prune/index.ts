/**
 * Pi-DCP: Dynamic Context Pruning Extension
 *
 * Intelligently prunes conversation context to optimize token usage
 * while preserving conversation coherence.
 *
 * Features:
 * - Deduplication: Remove duplicate tool outputs
 * - Superseded writes: Remove older file versions
 * - Error purging: Remove resolved errors
 * - Recency protection: Always keep recent messages
 *
 * Architecture:
 * - Prepare phase: Rules annotate message metadata
 * - Process phase: Rules make pruning decisions
 * - Filter phase: Remove pruned messages
 */

import type { ExtensionAPI,ContextEvent,ExtensionContext } from "@mariozechner/pi-coding-agent";

// Register all built-in rules on import
import { registerRule } from "./src/registry";
import { deduplicationRule } from "./src/rules/deduplication";
import { supersededWritesRule } from "./src/rules/superseded-writes";
import { errorPurgingRule } from "./src/rules/error-purging";
import { toolPairingRule } from "./src/rules/tool-pairing";
import { recencyRule } from "./src/rules/recency";
import { DcpConfigWithPruneRuleObjects, StatsTracker } from "./src/types";
import { applyPruningWorkflow } from "./src/workflow";

const DEFAULT_CONFIG: DcpConfigWithPruneRuleObjects = {
	enabled: true,
	debug: true,
	keepRecentCount: 10,
	rules: [deduplicationRule, supersededWritesRule, errorPurgingRule, toolPairingRule, recencyRule],
};
for (const rule of DEFAULT_CONFIG.rules) {
	registerRule(rule);
}

interface ContextEventHandlerOptions {
	config: DcpConfigWithPruneRuleObjects;
	statsTracker: StatsTracker;
}

/**
 * Creates a context event handler that applies pruning to messages.
 * 
 * @param options - Configuration and stats tracker
 * @returns Event handler function
 */
export function createContextEventHandler(options: ContextEventHandlerOptions) {
	const { config, statsTracker } = options;

	return async (event: ContextEvent, ctx: ExtensionContext) => {
		try {
			const originalCount = event.messages.length;

			// Apply pruning workflow
			const prunedMessages = applyPruningWorkflow(event.messages, config);

			const prunedCount = originalCount - prunedMessages.length;
			statsTracker.totalPruned += prunedCount;
			statsTracker.totalProcessed += originalCount;

			if (prunedCount > 0) {
				// Show toast notification when pruning occurs
				// ctx. //(`DCP: Pruned ${prunedCount}/${originalCount} messages`, "info");
			}

			if (config.debug) {
				ctx.ui.notify(`[pi-dcp] Pruned ${prunedCount} / ${originalCount} messages`);
			}

			return { messages: prunedMessages };
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			ctx.ui.notify(`[pi-dcp] Error in pruning workflow: ${errorMessage}`, "error");
			// Fail-safe: return original messages on error
			return { messages: event.messages };
		}
	};
}

export default async function (pi: ExtensionAPI) {
	const config = DEFAULT_CONFIG;
	if (!config.enabled) {
		return; // Exit early if extension is disabled
	}

	// Track stats across session
	const statsTracker: StatsTracker = {
		totalPruned: 0,
		totalProcessed: 0,
	};

	// Hook into context event (before each LLM call)
	pi.on("context", createContextEventHandler({ config, statsTracker }));
}

