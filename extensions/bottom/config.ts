import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export type IconSet = "unicode" | "ascii" | "nerd";
export type DashboardMode = "auto" | "on" | "off";

export interface ShowOptions {
	ctx: boolean;
	tokens: boolean;
	tps: boolean;
	cost: boolean;
	cache: boolean;
	model: boolean;
	thinking: boolean;
	cwd: boolean;
	git: boolean;
	session: boolean;
	clock: boolean;
	tool: boolean;
	statuses: boolean;
}

export interface BottomConfig {
	enabled: boolean;
	dashboard: DashboardMode;
	dashboardPlacement: "aboveEditor" | "belowEditor";
	icons: IconSet;
	frameEditor: boolean;
	spinner: boolean;
	show: ShowOptions;
}

export const DEFAULT_CONFIG: BottomConfig = {
	enabled: true,
	dashboard: "auto",
	dashboardPlacement: "aboveEditor",
	icons: "unicode",
	frameEditor: true,
	spinner: true,
	show: {
		ctx: true,
		tokens: true,
		tps: true,
		cost: true,
		cache: true,
		model: true,
		thinking: true,
		cwd: true,
		git: true,
		session: true,
		clock: true,
		tool: true,
		statuses: true,
	},
};

export function configPath(): string {
	return join(getAgentDir(), "bottom.json");
}

function cloneDefaults(): BottomConfig {
	return { ...DEFAULT_CONFIG, show: { ...DEFAULT_CONFIG.show } };
}

export function loadConfig(): BottomConfig {
	try {
		const raw = JSON.parse(readFileSync(configPath(), "utf8")) as unknown;
		return normalizeConfig(raw);
	} catch {
		return cloneDefaults();
	}
}

export function saveConfig(config: BottomConfig): boolean {
	try {
		mkdirSync(dirname(configPath()), { recursive: true });
		writeFileSync(configPath(), `${JSON.stringify(config, null, 2)}\n`, "utf8");
		return true;
	} catch {
		return false;
	}
}

export function resetConfig(): BottomConfig {
	return cloneDefaults();
}

function normalizeConfig(raw: unknown): BottomConfig {
	const source = isRecord(raw) ? raw : {};
	const show = isRecord(source.show) ? source.show : {};
	const icons: IconSet =
		source.icons === "ascii" || source.icons === "nerd" || source.icons === "unicode"
			? source.icons
			: DEFAULT_CONFIG.icons;
	const dashboard: DashboardMode =
		source.dashboard === "auto" || source.dashboard === "on" || source.dashboard === "off"
			? source.dashboard
			: DEFAULT_CONFIG.dashboard;
	const placement =
		source.dashboardPlacement === "belowEditor" || source.dashboardPlacement === "aboveEditor"
			? source.dashboardPlacement
			: DEFAULT_CONFIG.dashboardPlacement;

	return {
		enabled: typeof source.enabled === "boolean" ? source.enabled : DEFAULT_CONFIG.enabled,
		dashboard,
		dashboardPlacement: placement,
		icons,
		frameEditor:
			typeof source.frameEditor === "boolean" ? source.frameEditor : DEFAULT_CONFIG.frameEditor,
		spinner: typeof source.spinner === "boolean" ? source.spinner : DEFAULT_CONFIG.spinner,
		show: {
			ctx: boolOr(show.ctx, DEFAULT_CONFIG.show.ctx),
			tokens: boolOr(show.tokens, DEFAULT_CONFIG.show.tokens),
			tps: boolOr(show.tps, DEFAULT_CONFIG.show.tps),
			cost: boolOr(show.cost, DEFAULT_CONFIG.show.cost),
			cache: boolOr(show.cache, DEFAULT_CONFIG.show.cache),
			model: boolOr(show.model, DEFAULT_CONFIG.show.model),
			thinking: boolOr(show.thinking, DEFAULT_CONFIG.show.thinking),
			cwd: boolOr(show.cwd, DEFAULT_CONFIG.show.cwd),
			git: boolOr(show.git, DEFAULT_CONFIG.show.git),
			session: boolOr(show.session, DEFAULT_CONFIG.show.session),
			clock: boolOr(show.clock, DEFAULT_CONFIG.show.clock),
			tool: boolOr(show.tool, DEFAULT_CONFIG.show.tool),
			statuses: boolOr(show.statuses, DEFAULT_CONFIG.show.statuses),
		},
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boolOr(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}
