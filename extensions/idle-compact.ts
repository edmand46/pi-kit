import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_COMPACTION_SETTINGS, estimateTokens, getAgentDir } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const ENTRY_TYPE = "idle-compact";

const INSTRUCTIONS =
	"The user stepped away and will resume this session later. Write the summary for continuation: " +
	"what we are working on, the decisions made and why, the files touched, the current state of the work, " +
	"the next steps and the open questions.";

interface IdleCompactConfig {
	idleMinutes: number;
	minTokens: number;
}

interface IdleCompactRecord {
	at: number;
	idleMinutes: number;
	tokensBefore: number;
	tokensAfter?: number;
	error?: string;
}

const DEFAULTS: IdleCompactConfig = {
	idleMinutes: 15,
	minTokens: 20000,
};

function positive(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function loadConfig(ctx: ExtensionContext): IdleCompactConfig {
	const path = join(getAgentDir(), "idle-compact.json");
	let raw: string;
	try {
		raw = readFileSync(path, "utf8");
	} catch {
		return DEFAULTS;
	}
	try {
		const parsed = JSON.parse(raw) as Partial<IdleCompactConfig>;
		return {
			idleMinutes: positive(parsed.idleMinutes, DEFAULTS.idleMinutes),
			minTokens: positive(parsed.minTokens, DEFAULTS.minTokens),
		};
	} catch {
		ctx.ui.notify(`idle-compact: ${path} is not valid JSON, using defaults`, "warning");
		return DEFAULTS;
	}
}

/**
 * Tokens pi keeps verbatim on compaction (settings.json → compaction.keepRecentTokens).
 * History below that threshold lands entirely in the kept tail, so pi has nothing to summarize.
 */
function keepRecentTokens(): number {
	try {
		const raw = readFileSync(join(getAgentDir(), "settings.json"), "utf8");
		const parsed = JSON.parse(raw) as { compaction?: { keepRecentTokens?: unknown } };
		return positive(parsed.compaction?.keepRecentTokens, DEFAULT_COMPACTION_SETTINGS.keepRecentTokens);
	} catch {
		return DEFAULT_COMPACTION_SETTINGS.keepRecentTokens;
	}
}

/**
 * Whether pi would find history to summarize. `ctx.compact()` throws
 * "Nothing to compact (session too small)" otherwise, surfacing as an error in the transcript.
 */
function hasSummarizableHistory(ctx: ExtensionContext): boolean {
	const branch = ctx.sessionManager.getBranch();
	if (branch.length === 0 || branch[branch.length - 1]?.type === "compaction") {
		return false;
	}
	const keep = keepRecentTokens();
	let tokens = 0;
	for (const entry of ctx.sessionManager.buildSessionProjection().entries) {
		for (const message of entry.messages) {
			tokens += estimateTokens(message);
			if (tokens > keep) {
				return true;
			}
		}
	}
	return false;
}

function formatTokens(tokens: number): string {
	return tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : `${tokens}`;
}

export default function (pi: ExtensionAPI) {
	let config = DEFAULTS;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let compacted = false;
	let tokensAtLastCompact: number | null = null;

	const cancel = () => {
		if (timer) {
			clearTimeout(timer);
		}
		timer = undefined;
	};

	const eligible = (ctx: ExtensionContext): number | null => {
		const tokens = ctx.getContextUsage()?.tokens ?? null;
		if (tokens === null || tokens < config.minTokens) {
			return null;
		}
		if (tokensAtLastCompact !== null && tokens <= tokensAtLastCompact) {
			return null;
		}
		return tokens;
	};

	const compactNow = (ctx: ExtensionContext, tokens: number) => {
		compacted = true;
		tokensAtLastCompact = tokens;
		ctx.ui.setStatus(ENTRY_TYPE, `compacting after ${config.idleMinutes} min idle`);
		ctx.compact({
			customInstructions: INSTRUCTIONS,
			onComplete: (result) => {
				ctx.ui.setStatus(ENTRY_TYPE, undefined);
				pi.appendEntry<IdleCompactRecord>(ENTRY_TYPE, {
					at: Date.now(),
					idleMinutes: config.idleMinutes,
					tokensBefore: result.tokensBefore,
					tokensAfter: result.estimatedTokensAfter,
				});
			},
			onError: (error) => {
				ctx.ui.setStatus(ENTRY_TYPE, undefined);
				// The guard can still race a growing session: pi treats "nothing to summarize" as a hard
				// error, but for an idle attempt it only means there was no work to do. Retry later.
				if (/nothing to compact|already compacted/i.test(error.message)) {
					compacted = false;
					return;
				}
				pi.appendEntry<IdleCompactRecord>(ENTRY_TYPE, {
					at: Date.now(),
					idleMinutes: config.idleMinutes,
					tokensBefore: tokens,
					error: error.message,
				});
			},
		});
	};

	const arm = (ctx: ExtensionContext) => {
		cancel();
		if (ctx.mode !== "tui" || compacted || eligible(ctx) === null) {
			return;
		}
		timer = setTimeout(
			() => {
				timer = undefined;
				if (compacted || !ctx.isIdle() || ctx.hasPendingMessages()) {
					return;
				}
				const tokens = eligible(ctx);
				if (tokens !== null && hasSummarizableHistory(ctx)) {
					compactNow(ctx, tokens);
				}
			},
			config.idleMinutes * 60_000,
		);
	};

	pi.on("session_start", (_event, ctx) => {
		cancel();
		config = loadConfig(ctx);
		compacted = false;
		tokensAtLastCompact = null;
	});

	pi.on("agent_settled", (_event, ctx) => arm(ctx));

	pi.on("input", () => {
		cancel();
		compacted = false;
	});

	pi.on("turn_start", () => cancel());

	pi.on("session_shutdown", () => cancel());

	pi.registerEntryRenderer<IdleCompactRecord>(ENTRY_TYPE, (entry, _options, theme) => {
		const data = entry.data;
		if (!data) {
			return undefined;
		}
		if (data.error) {
			return new Text(theme.fg("error", `idle compact failed · ${data.error}`), 0, 0);
		}
		const after = data.tokensAfter === undefined ? "" : ` → ${formatTokens(data.tokensAfter)}`;
		return new Text(
			theme.fg(
				"dim",
				`idle compact · ${data.idleMinutes} min idle · ${formatTokens(data.tokensBefore)}${after} tokens`,
			),
			0,
			0,
		);
	});
}
