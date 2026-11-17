import { closeSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const MAX_TIMEOUT = 2 ** 31 - 1;
const MAX_TASKS = 20;
const MAX_TEXT = 2000;
const MIN_EVERY = 60_000;
const MIN_DELAY = 5_000;
const LOCK_STALE = 5_000;

const USAGE =
	"scheduler — /schedule in 90m <text> | /schedule every 30m <text> | /schedules | /unschedule <id> (units: s m h d, every must be at least 1m)";

const UNITS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

interface Task {
	id: string;
	text: string;
	nextAt: number;
	everyMs?: number;
}

function storePath(): string {
	return join(getAgentDir(), "scheduler.json");
}

function stamp(ms: number): string {
	const date = new Date(ms);
	const pad = (value: number) => `${value}`.padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDuration(ms: number): string {
	for (const unit of ["d", "h", "m", "s"]) {
		const size = UNITS[unit];
		if (ms >= size && ms % size === 0) {
			return `${ms / size}${unit}`;
		}
	}
	return `${Math.round(ms / 1000)}s`;
}

function parseSpec(args: string): { kind: "in" | "every"; ms: number; text: string } | undefined {
	const match = /^(in|every)\s+(\d+)\s*([smhd])\s+([\s\S]+)$/i.exec(args.trim());
	if (!match) {
		return undefined;
	}
	const kind = match[1].toLowerCase() as "in" | "every";
	const ms = Number(match[2]) * UNITS[match[3].toLowerCase()];
	const text = match[4].trim();
	if (!Number.isFinite(ms) || !text) {
		return undefined;
	}
	if (kind === "every" ? ms < MIN_EVERY : ms < MIN_DELAY) {
		return undefined;
	}
	return { kind, ms, text };
}

function load(ctx: ExtensionContext): Task[] {
	let raw: string;
	try {
		raw = readFileSync(storePath(), "utf8");
	} catch {
		return [];
	}
	try {
		const parsed = JSON.parse(raw) as { tasks?: unknown };
		const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
		return tasks
			.filter(
				(task): task is Task =>
					typeof task === "object" &&
					task !== null &&
					typeof (task as Task).id === "string" &&
					typeof (task as Task).text === "string" &&
					typeof (task as Task).nextAt === "number",
			)
			.map((task) =>
				typeof task.everyMs === "number" && Number.isFinite(task.everyMs) && task.everyMs >= MIN_EVERY
					? task
					: { id: task.id, text: task.text, nextAt: task.nextAt },
			);
	} catch {
		ctx.ui.notify(`scheduler: ${storePath()} is not valid JSON, ignoring it`, "warning");
		return [];
	}
}

function save(tasks: Task[]): void {
	const path = storePath();
	const tmp = `${path}.${process.pid}.tmp`;
	writeFileSync(tmp, `${JSON.stringify({ tasks }, null, 2)}\n`, "utf8");
	renameSync(tmp, path);
}

// One scheduler.json shared by every pi process, so reading, firing and updating a due task
// must happen under a single lock. Returns undefined when another process holds it.
function withLock<T>(fn: () => T): T | undefined {
	const lock = `${storePath()}.lock`;
	const acquire = (): number | undefined => {
		try {
			return openSync(lock, "wx");
		} catch {
			return undefined;
		}
	};
	let handle = acquire();
	if (handle === undefined) {
		try {
			if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE) {
				unlinkSync(lock);
				handle = acquire();
			}
		} catch {
				handle = acquire();
		}
	}
	if (handle === undefined) {
		return undefined;
	}
	try {
		return fn();
	} finally {
		closeSync(handle);
		try {
			unlinkSync(lock);
		} catch {
			// another process already cleaned up a stale lock
		}
	}
}

export default function (pi: ExtensionAPI) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let active: ExtensionContext | undefined;

	function clearTimer(): void {
		if (timer) {
			clearTimeout(timer);
			timer = undefined;
		}
	}

	function fire(ctx: ExtensionContext, task: Task, at: number): void {
		const text = `[scheduled ${stamp(at)}] ${task.text}`;
		if (ctx.isIdle()) {
			pi.sendUserMessage(text);
		} else {
			pi.sendUserMessage(text, { deliverAs: "followUp" });
		}
		ctx.ui.notify(`scheduled #${task.id} fired`, "info");
	}

	// Fires every due task once under the file lock, then re-arms.
	function run(): void {
		const ctx = active;
		if (!ctx || ctx.mode !== "tui") {
			return;
		}
		try {
			withLock(() => {
				const tasks = load(ctx);
				const now = Date.now();
				for (const task of tasks) {
					if (task.nextAt > now) {
						continue;
					}
					const at = task.nextAt;
					try {
						fire(ctx, task, at);
					} catch (error) {
						// the task stays due, so the next arm retries it instead of losing it
						ctx.ui.notify(
							`scheduler: could not deliver #${task.id}: ${error instanceof Error ? error.message : String(error)}`,
							"error",
						);
						continue;
					}
					if (task.everyMs) {
						// shortcut: a long absence collapses to one catch-up, nextAt is advanced to the future
						while (task.nextAt <= now) {
							task.nextAt += task.everyMs;
						}
					} else {
						tasks.splice(tasks.indexOf(task), 1);
					}
				}
				save(tasks);
			});
		} finally {
			arm();
		}
	}

	function arm(ctx?: ExtensionContext): void {
		if (ctx) {
			active = ctx;
		}
		clearTimer();
		const current = active;
		if (!current || current.mode !== "tui") {
			return;
		}
		const tasks = load(current);
		current.ui.setStatus("scheduler", tasks.length ? `${tasks.length} scheduled` : undefined);
		if (!tasks.length) {
			return;
		}
		const next = Math.min(...tasks.map((task) => task.nextAt));
		const delay = Math.max(0, Math.min(next - Date.now(), MAX_TIMEOUT));
		timer = setTimeout(() => {
			timer = undefined;
			run();
		}, delay);
		timer.unref?.();
	}

	pi.on("session_start", (_event, ctx) => arm(ctx));
	pi.on("agent_settled", (_event, ctx) => arm(ctx));
	pi.on("session_shutdown", () => {
		clearTimer();
		active?.ui.setStatus("scheduler", undefined);
		active = undefined;
	});

	pi.registerCommand("schedule", {
		description: "Schedule a prompt: /schedule in 90m <text> or /schedule every 30m <text>",
		handler: async (args, ctx) => {
			const spec = parseSpec(args);
			if (!spec) {
				ctx.ui.notify(USAGE, "warning");
				return;
			}
			if (spec.text.length > MAX_TEXT) {
				ctx.ui.notify(`scheduler: text is longer than ${MAX_TEXT} characters`, "warning");
				return;
			}
			const tasks = load(ctx);
			if (tasks.length >= MAX_TASKS) {
				ctx.ui.notify(`scheduler: ${MAX_TASKS} tasks are already scheduled`, "warning");
				return;
			}
			const task: Task = {
				id: Math.random().toString(36).slice(2, 6),
				text: spec.text,
				nextAt: Date.now() + spec.ms,
			};
			if (spec.kind === "every") {
				task.everyMs = spec.ms;
			}
			tasks.push(task);
			save(tasks);
			arm(ctx);
			ctx.ui.notify(
				`scheduled #${task.id} ${spec.kind === "every" ? `every ${formatDuration(spec.ms)}` : "once"} · ${stamp(task.nextAt)}`,
				"info",
			);
		},
	});

	pi.registerCommand("schedules", {
		description: "List scheduled prompts",
		handler: async (_args, ctx) => {
			const tasks = load(ctx).sort((left, right) => left.nextAt - right.nextAt);
			if (!tasks.length) {
				ctx.ui.notify("scheduler: nothing scheduled", "info");
				return;
			}
			ctx.ui.notify(
				tasks
					.map(
						(task) =>
							`#${task.id} · ${stamp(task.nextAt)}${task.everyMs ? ` every ${formatDuration(task.everyMs)}` : ""} · ${task.text.slice(0, 60)}`,
					)
					.join("\n"),
				"info",
			);
		},
	});

	pi.registerCommand("unschedule", {
		description: "Remove a scheduled prompt by id",
		handler: async (args, ctx) => {
			const id = args.trim().replace(/^#/, "");
			if (!id) {
				ctx.ui.notify("scheduler: /unschedule <id>", "warning");
				return;
			}
			const tasks = load(ctx);
			const kept = tasks.filter((task) => task.id !== id);
			if (kept.length === tasks.length) {
				ctx.ui.notify(`scheduler: no task #${id}`, "warning");
				return;
			}
			save(kept);
			arm(ctx);
			ctx.ui.notify(`scheduler: removed #${id}`, "info");
		},
	});
}
