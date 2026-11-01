import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { IconSet } from "./config";

export interface Icons {
	sep: string;
	spinner: string[];
	bullet: string;
	check: string;
	cross: string;
	full: string;
	empty: string;
	up: string;
	down: string;
	timer: string;
	cache: string;
	peak: string;
	offPeak: string;
	clock: string;
	bar: string;
	ellipsis: string;
	h: string;
	v: string;
	tl: string;
	tr: string;
	bl: string;
	br: string;
}

const BRAILLE = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function getIcons(set: IconSet): Icons {
	if (set === "ascii") {
		return {
			sep: " | ",
			spinner: ["|", "/", "-", "\\"],
			bullet: "*",
			check: "ok",
			cross: "x",
			full: "#",
			empty: "-",
			up: "^",
			down: "v",
			timer: "",
			cache: "CH",
			peak: "",
			offPeak: "",
			clock: "",
			bar: "|",
			ellipsis: "...",
			h: "-",
			v: "|",
			tl: "+",
			tr: "+",
			bl: "+",
			br: "+",
		};
	}

	if (set === "nerd") {
		return {
			sep: " · ",
			spinner: BRAILLE,
			bullet: "●",
			check: "✓",
			cross: "✗",
			full: "█",
			empty: "░",
			up: "↑",
			down: "↓",
			timer: "\uF017",
			cache: "\uF021",
			peak: "\uF185",
			offPeak: "\uF186",
			clock: "\uF017",
			bar: "▏",
			ellipsis: "…",
			h: "─",
			v: "│",
			tl: "╭",
			tr: "╮",
			bl: "╰",
			br: "╯",
		};
	}

	return {
		sep: " · ",
		spinner: BRAILLE,
		bullet: "●",
		check: "✓",
		cross: "✗",
		full: "█",
		empty: "░",
		up: "↑",
		down: "↓",
		timer: "",
		cache: "⟳",
		peak: "☀",
		offPeak: "☾",
		clock: "⏱",
		bar: "▏",
		ellipsis: "…",
		h: "─",
		v: "│",
		tl: "╭",
		tr: "╮",
		bl: "╰",
		br: "╯",
	};
}

export function formatTokens(count: number): string {
	if (!Number.isFinite(count) || count <= 0) return "0";
	if (count < 1000) return String(Math.round(count));
	if (count < 10_000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
	if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
	return `${Math.round(count / 1_000_000)}M`;
}

export const EMPTY_RATE = "—";

export function formatRateValue(value: number | undefined): string {
	if (value === undefined || !Number.isFinite(value) || value < 1) return EMPTY_RATE;
	return String(Math.round(value));
}

export function formatCost(cost: number): string {
	if (!Number.isFinite(cost) || cost <= 0) return "$0";
	if (cost < 0.001) return "<$0.001";
	if (cost < 1) return `$${cost.toFixed(3)}`;
	return `$${cost.toFixed(2)}`;
}

export function formatDuration(ms: number): string {
	if (!Number.isFinite(ms) || ms < 0) ms = 0;
	if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes < 60) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
	const hours = Math.floor(minutes / 60);
	return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export function shortenPath(path: string, home = process.env.HOME ?? process.env.USERPROFILE): string {
	if (!home) return path;
	if (path === home) return "~";
	const prefix = home.endsWith("/") ? home : `${home}/`;
	if (path.startsWith(prefix)) return `~/${path.slice(prefix.length)}`;
	return path;
}

export function sanitizeStatus(value: string): string {
	return value
		.replace(/[\r\n\t]+/g, " ")
		.replace(/ +/g, " ")
		.trim();
}

export interface PeakClock {
	time: string;
	peak: boolean;
	windows: string | null;
}

const PEAK_WINDOWS_UTC: ReadonlyArray<readonly [number, number]> = [
	[1, 4],
	[6, 10],
];

export function peakClock(date: Date | number = new Date()): PeakClock {
	const value = typeof date === "number" ? new Date(date) : date;
	const utcHour = value.getUTCHours();
	const utcDay = value.getUTCDay();
	const weekday = utcDay !== 0 && utcDay !== 6;
	const offsetMinutes = -value.getTimezoneOffset();

	return {
		time: `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`,
		peak:
			weekday &&
			PEAK_WINDOWS_UTC.some(([start, end]) => utcHour >= start && utcHour < end),
		windows: weekday
			? PEAK_WINDOWS_UTC.map(
					([start, end]) => `${hourText(start * 60 + offsetMinutes)}–${hourText(end * 60 + offsetMinutes)}`,
				).join(", ")
			: null,
	};
}

function hourText(minutesOfDay: number): string {
	const total = ((minutesOfDay % 1440) + 1440) % 1440;
	const hours = String(Math.floor(total / 60)).padStart(2, "0");
	const minutes = total % 60;
	return minutes === 0 ? hours : `${hours}:${String(minutes).padStart(2, "0")}`;
}

export function gauge(percent: number, theme: Theme, icons: Icons, cells = 8): string {
	const clamped = Math.max(0, Math.min(100, percent));
	const filled = Math.round((clamped / 100) * cells);
	const color = gaugeColor(clamped);
	return (
		theme.fg(color, icons.full.repeat(filled)) +
		theme.fg("dim", icons.empty.repeat(Math.max(0, cells - filled)))
	);
}

export function gaugeColor(percent: number): "success" | "warning" | "error" {
	if (percent > 90) return "error";
	if (percent > 70) return "warning";
	return "success";
}

export function firstLine(value: string, max = 32): string {
	const line = value.split(/\r?\n/, 1)[0] ?? "";
	return truncateToWidth(line, max, "…", false);
}
