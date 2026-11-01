import type {
	ExtensionAPI,
	ExtensionContext,
	ReadonlyFooterDataProvider,
	ThemeColor,
} from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { loadConfig, type BottomConfig } from "./config";
import { firstLine, peakClock, type PeakClock } from "./format";

export interface ToolRun {
	id: string;
	name: string;
	label: string;
	startedAt: number;
}

export interface GitInfo {
	isRepo: boolean;
	changed: number;
	untracked: number;
	ahead: number;
	behind: number;
	added: number;
	removed: number;
}

export interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	cacheHitRate?: number;
}

export interface Snapshot {
	modelId: string;
	provider: string;
	reasoning: boolean;
	thinking: string;
	contextPercent: number | null;
	contextWindow: number;
	usage: UsageStats;
	tpsLast?: number;
	tpsAverage?: number;
	streamingAnswer: boolean;
	working: boolean;
	compacting: boolean;
	tools: ToolRun[];
	lastTool?: { name: string; ok: boolean; durationMs?: number };
	toolSuccess: number;
	toolFailure: number;
	turnCount: number;
	lastTurnMs?: number;
	sessionElapsedMs: number;
	sessionName?: string;
	pending: boolean;
	branch: string | null;
	git: GitInfo;
	cwd: string;
	clock: PeakClock;
}

const EMPTY_USAGE: UsageStats = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	cost: 0,
};

const EMPTY_GIT: GitInfo = {
	isRepo: false,
	changed: 0,
	untracked: 0,
	ahead: 0,
	behind: 0,
	added: 0,
	removed: 0,
};

export class BottomModel {
	config: BottomConfig;
	ctx?: ExtensionContext;
	tui?: TUI;
	footerData?: ReadonlyFooterDataProvider;
	branch: string | null = null;

	working = false;
	compacting = false;
	streamingAnswer = false;
	lastTurnMs?: number;
	turnCount = 0;
	turnStartedAt = 0;
	tools = new Map<string, ToolRun>();
	toolSuccess = 0;
	toolFailure = 0;
	lastTool?: { name: string; ok: boolean; durationMs?: number };
	sessionStartedAt = Date.now();
	git: GitInfo = { ...EMPTY_GIT };

	private statsCache?: {
		key: string;
		usage: UsageStats;
		lastRate?: number;
		averageRate?: number;
	};
	private gitTimer?: ReturnType<typeof setTimeout>;
	private gitBusy = false;
	private gitPending = false;
	private busyTimer?: ReturnType<typeof setInterval>;
	private clockTimer?: ReturnType<typeof setInterval>;

	constructor(private pi: ExtensionAPI) {
		this.config = loadConfig();
	}

	setContext(ctx: ExtensionContext): void {
		this.ctx = ctx;
	}

	resetSession(ctx: ExtensionContext): void {
		this.setContext(ctx);
		this.working = !ctx.isIdle();
		this.compacting = false;
		this.tools.clear();
		this.toolSuccess = 0;
		this.toolFailure = 0;
		this.lastTool = undefined;
		this.statsCache = undefined;
		this.git = { ...EMPTY_GIT };

		const entries = ctx.sessionManager.getEntries();
		this.sessionStartedAt = Date.now();
		this.turnCount = 0;
		for (const raw of entries) {
			const entry = raw as {
				type?: string;
				message?: { role?: string; isError?: boolean };
			};
			if (entry.type !== "message") continue;
			if (entry.message?.role === "user") this.turnCount++;
			if (entry.message?.role === "toolResult") {
				if (entry.message.isError) this.toolFailure++;
				else this.toolSuccess++;
			}
		}

		this.startClock();
		this.syncBusyTimer();
		this.streamingAnswer = !ctx.isIdle();
		void this.refreshGit(true);
	}

	get dashboardVisible(): boolean {
		const mode = this.config.dashboard;
		if (mode === "on") return true;
		if (mode === "off") return false;
		const rows = this.tui?.terminal.rows ?? 30;
		const columns = this.tui?.terminal.columns ?? 100;
		return rows >= 30 && columns >= 80;
	}

	resume(): void {
		this.startClock();
		this.syncBusyTimer();
		this.requestRender();
	}

	requestRender(): void {
		this.tui?.requestRender();
	}

	setWorking(working: boolean): void {
		if (working) {
			this.working = true;
		} else {
			this.working = false;
			this.compacting = false;
			this.streamingAnswer = false;
			this.tools.clear();
			void this.refreshGit(true);
		}
		this.syncBusyTimer();
		this.requestRender();
	}

	setAnswerStreaming(streaming: boolean): void {
		this.streamingAnswer = streaming;
		this.requestRender();
	}

	setCompacting(compacting: boolean): void {
		this.compacting = compacting;
		if (!compacting) void this.refreshGit(true);
		this.syncBusyTimer();
		this.requestRender();
	}

	startTurn(timestamp?: number): void {
		this.turnStartedAt = timestamp && Number.isFinite(timestamp) ? timestamp : Date.now();
		this.turnCount++;
		this.requestRender();
	}

	endTurn(timestamp?: number): void {
		const end = timestamp && Number.isFinite(timestamp) ? timestamp : Date.now();
		if (this.turnStartedAt > 0) this.lastTurnMs = Math.max(0, end - this.turnStartedAt);
		this.requestRender();
	}

	toolStarted(id: string, name: string, args: unknown): void {
		this.tools.set(id, {
			id,
			name,
			label: summarizeTool(name, args),
			startedAt: Date.now(),
		});
		this.syncBusyTimer();
		this.requestRender();
	}

	toolEnded(id: string, isError: boolean, durationMs?: number): void {
		const tool = this.tools.get(id);
		this.tools.delete(id);
		if (isError) this.toolFailure++;
		else this.toolSuccess++;
		if (tool) this.lastTool = { name: tool.name, ok: !isError, durationMs };
		void this.refreshGit();
		this.syncBusyTimer();
		this.requestRender();
	}

	getUsageStats(): UsageStats {
		return this.getStats().usage;
	}

	private getStats(): SessionStats {
		const ctx = this.ctx;
		if (!ctx) return { usage: { ...EMPTY_USAGE } };

		const entries = ctx.sessionManager.getEntries();
		const key = `${ctx.sessionManager.getSessionId()}:${ctx.sessionManager.getLeafId()}:${entries.length}`;
		if (this.statsCache?.key === key) return this.statsCache;

		const usage: UsageStats = { ...EMPTY_USAGE };
		let latestHit: number | undefined;
		let ratedOutput = 0;
		let ratedDurationMs = 0;
		let lastRate: number | undefined;

		for (const raw of entries) {
			const entry = raw as {
				type?: string;
				usage?: RawUsage;
				message?: { role?: string; usage?: RawUsage; durationMs?: number };
			};
			if (entry.type === "usage" && entry.usage) {
				addUsage(usage, entry.usage);
			} else if (entry.type === "message" && entry.message?.usage) {
				addUsage(usage, entry.message.usage);
				if (entry.message.role === "assistant") {
					const prompt =
						entry.message.usage.input +
						entry.message.usage.cacheRead +
						entry.message.usage.cacheWrite;
					if (prompt > 0) latestHit = (entry.message.usage.cacheRead / prompt) * 100;

					const durationMs = entry.message.durationMs;
					const output = entry.message.usage.output;
					if (durationMs !== undefined && durationMs > 0 && output > 0) {
						lastRate = (output / durationMs) * 1000;
						ratedOutput += output;
						ratedDurationMs += durationMs;
					}
				}
			} else if (
				(entry.type === "branch_summary" || entry.type === "compaction") &&
				entry.usage
			) {
				addUsage(usage, entry.usage);
			}
		}

		usage.cacheHitRate = latestHit;
		this.statsCache = {
			key,
			usage,
			lastRate,
			averageRate: ratedDurationMs > 0 ? (ratedOutput / ratedDurationMs) * 1000 : undefined,
		};
		return this.statsCache;
	}

	snapshot(): Snapshot {
		const ctx = this.ctx;
		const stats = this.getStats();
		const context = ctx?.getContextUsage();
		const now = Date.now();
		const sessionName = safeSessionName(this.pi, ctx);

		return {
			modelId: ctx?.model?.id ?? "no-model",
			provider: ctx?.model?.provider ?? "",
			reasoning: Boolean(ctx?.model?.reasoning),
			thinking: safeThinking(this.pi),
			contextPercent: context?.percent ?? null,
			contextWindow: context?.contextWindow ?? ctx?.model?.contextWindow ?? 0,
			usage: stats.usage,
			tpsLast: stats.lastRate,
			tpsAverage: stats.averageRate,
			streamingAnswer: this.streamingAnswer,
			working: this.working,
			compacting: this.compacting,
			tools: [...this.tools.values()].sort((a, b) => a.startedAt - b.startedAt),
			lastTool: this.lastTool,
			toolSuccess: this.toolSuccess,
			toolFailure: this.toolFailure,
			turnCount: this.turnCount,
			lastTurnMs: this.lastTurnMs,
			sessionElapsedMs: Math.max(0, now - this.sessionStartedAt),
			sessionName,
			pending: ctx?.hasPendingMessages() ?? false,
			branch: this.branch,
			git: this.git,
			cwd: ctx?.cwd ?? process.cwd(),
			clock: peakClock(now),
		};
	}

	refreshGit(immediate = false): void {
		if (!this.ctx || !this.config.enabled || !this.config.show.git) return;
		if (this.gitTimer) clearTimeout(this.gitTimer);
		const delay = immediate ? 10 : 700;
		this.gitTimer = setTimeout(() => {
			this.gitTimer = undefined;
			void this.updateGit();
		}, delay);
	}

	startClock(): void {
		if (this.clockTimer) return;
		this.clockTimer = setInterval(() => this.requestRender(), 1000);
	}

	stopTimers(): void {
		if (this.gitTimer) {
			clearTimeout(this.gitTimer);
			this.gitTimer = undefined;
		}
		if (this.busyTimer) {
			clearInterval(this.busyTimer);
			this.busyTimer = undefined;
		}
		if (this.clockTimer) {
			clearInterval(this.clockTimer);
			this.clockTimer = undefined;
		}
	}

	private syncBusyTimer(): void {
		const busy =
			Boolean(this.tui) && this.config.enabled && (this.working || this.compacting || this.tools.size > 0);
		if (busy && !this.busyTimer) {
			this.busyTimer = setInterval(() => this.requestRender(), 100);
		} else if (!busy && this.busyTimer) {
			clearInterval(this.busyTimer);
			this.busyTimer = undefined;
		}
	}

	private async updateGit(): Promise<void> {
		const ctx = this.ctx;
		if (!ctx) return;
		if (this.gitBusy) {
			this.gitPending = true;
			return;
		}

		this.gitBusy = true;
		try {
			const [status, diff] = await Promise.all([
				this.pi
					.exec(
						"git",
						[
							"--no-optional-locks",
							"status",
							"--porcelain=v2",
							"--branch",
							"--untracked-files=normal",
						],
						{ cwd: ctx.cwd, timeout: 4000 },
					)
					.catch(() => undefined),
				this.pi
					.exec("git", ["--no-optional-locks", "diff", "HEAD", "--numstat"], {
						cwd: ctx.cwd,
						timeout: 4000,
					})
					.catch(() => undefined),
			]);

			if (this.ctx !== ctx) return;

			const info: GitInfo = { ...EMPTY_GIT };
			if (status && status.code === 0) {
				info.isRepo = true;
				for (const line of status.stdout.split("\n")) {
					if (line.startsWith("# branch.ab ")) {
						const match = /\+(\d+)\s+-(\d+)/.exec(line);
						if (match) {
							info.ahead = Number(match[1] ?? 0);
							info.behind = Number(match[2] ?? 0);
						}
					} else if (line.startsWith("? ")) {
						info.untracked++;
					} else if (/^[12u] /.test(line)) {
						info.changed++;
					}
				}
			}

			if (diff && diff.code === 0) {
				for (const line of diff.stdout.split("\n")) {
					const [added, removed] = line.split("\t");
					if (!added || !removed) continue;
					const a = Number(added);
					const r = Number(removed);
					if (Number.isFinite(a)) info.added += a;
					if (Number.isFinite(r)) info.removed += r;
				}
			}

			this.git = info;
			this.branch = this.footerData?.getGitBranch() ?? this.branch;
			this.requestRender();
		} finally {
			this.gitBusy = false;
			if (this.gitPending) {
				this.gitPending = false;
				void this.updateGit();
			}
		}
	}
}

interface SessionStats {
	usage: UsageStats;
	lastRate?: number;
	averageRate?: number;
}

interface RawUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost?: { total?: number };
}

function addUsage(target: UsageStats, usage: RawUsage): void {
	target.input += numberOr(usage.input);
	target.output += numberOr(usage.output);
	target.cacheRead += numberOr(usage.cacheRead);
	target.cacheWrite += numberOr(usage.cacheWrite);
	target.cost += numberOr(usage.cost?.total);
}

function numberOr(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function safeThinking(pi: ExtensionAPI): string {
	try {
		return pi.getThinkingLevel();
	} catch {
		return "off";
	}
}

function safeSessionName(pi: ExtensionAPI, ctx: ExtensionContext | undefined): string | undefined {
	try {
		const name = pi.getSessionName();
		if (name) return name;
	} catch {
		// fall through to the session manager
	}
	return ctx?.sessionManager.getSessionName() ?? undefined;
}

export function summarizeTool(name: string, args: unknown): string {
	const input = (args ?? {}) as Record<string, unknown>;
	const text = (value: unknown): string => (typeof value === "string" ? value : "");
	const path = (value: unknown): string => {
		const raw = text(value);
		if (!raw) return "";
		const parts = raw.split(/[\\/]/);
		return parts[parts.length - 1] || raw;
	};

	switch (name) {
		case "bash":
		case "powershell":
			return firstLine(text(input.command));
		case "read":
		case "write":
		case "edit":
			return path(input.path ?? input.file_path);
		case "ls":
			return path(input.path) || ".";
		case "grep": {
			const pattern = text(input.pattern);
			if (!pattern) return "";
			const where = path(input.path);
			return where ? `/${firstLine(pattern, 24)}/ ${where}` : `/${firstLine(pattern, 24)}/`;
		}
		case "find":
			return firstLine(text(input.pattern ?? input.glob));
		default:
			return "";
	}
}

export function thinkingColor(level: string): ThemeColor {
	switch (level) {
		case "minimal":
			return "thinkingMinimal";
		case "low":
			return "thinkingLow";
		case "medium":
			return "thinkingMedium";
		case "high":
			return "thinkingHigh";
		case "xhigh":
			return "thinkingXhigh";
		case "max":
			return "thinkingMax";
		default:
			return "thinkingOff";
	}
}
