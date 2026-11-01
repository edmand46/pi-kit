import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	configPath,
	resetConfig,
	saveConfig,
	type BottomConfig,
	type DashboardMode,
	type IconSet,
} from "./config";
import { BottomDashboard, BottomEditor, BottomFooter } from "./components";
import { BottomModel } from "./state";

const WIDGET_KEY = "bottom-dashboard";

export default function bottomExtension(pi: ExtensionAPI): void {
	const model = new BottomModel(pi);
	let installed = false;

	const restore = (ctx: ExtensionContext): void => {
		if (installed && ctx.mode === "tui") {
			try {
				ctx.ui.setFooter(undefined);
				ctx.ui.setEditorComponent(undefined);
				ctx.ui.setWidget(WIDGET_KEY, undefined);
				ctx.ui.setWorkingVisible(true);
			} catch {
				// The UI can already be gone while pi shuts down.
			}
		}
		installed = false;
		model.stopTimers();
		model.tui = undefined;
		model.footerData = undefined;
	};

	const apply = (ctx: ExtensionContext): void => {
		model.setContext(ctx);

		if (ctx.mode !== "tui") return;

		if (!model.config.enabled) {
			if (installed) restore(ctx);
			else model.stopTimers();
			return;
		}

		ctx.ui.setFooter((tui, theme, footerData) => {
			model.tui = tui;
			return new BottomFooter(model, theme, footerData);
		});

		if (model.config.frameEditor) {
			ctx.ui.setWorkingVisible(false);
			ctx.ui.setEditorComponent(
				(tui, editorTheme, keybindings) =>
					new BottomEditor(tui, editorTheme, keybindings, model, ctx.ui.theme),
			);
		} else {
			ctx.ui.setWorkingVisible(true);
			ctx.ui.setEditorComponent(undefined);
		}

		ctx.ui.setWidget(
			WIDGET_KEY,
			(tui, theme) => {
				model.tui = tui;
				return new BottomDashboard(model, theme);
			},
			{ placement: model.config.dashboardPlacement },
		);

		installed = true;
		model.resume();
	};

	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		model.resetSession(ctx);
		if (model.config.enabled) apply(ctx);
		else if (installed) restore(ctx);
		else {
			model.stopTimers();
			model.tui = undefined;
		}
	});

	pi.on("session_shutdown", (event, ctx) => {
		model.stopTimers();
		if (event.reason === "quit" && installed) {
			try {
				restore(ctx);
			} catch {
				// Shutdown should never fail because of presentation.
			}
		}
	});

	pi.on("agent_start", () => model.setWorking(true));
	pi.on("agent_settled", () => model.setWorking(false));
	pi.on("turn_start", (event) => model.startTurn(event.timestamp));
	pi.on("turn_end", () => model.endTurn());
	pi.on("tool_execution_start", (event) =>
		model.toolStarted(event.toolCallId, event.toolName, event.args),
	);
	pi.on("tool_execution_end", (event) =>
		model.toolEnded(event.toolCallId, event.isError, event.durationMs),
	);
	pi.on("session_before_compact", () => model.setCompacting(true));
	pi.on("session_compact", () => {
		model.setCompacting(false);
		model.requestRender();
	});
	pi.on("session_compact_failed", () => model.setCompacting(false));
	pi.on("session_info_changed", () => model.requestRender());
	pi.on("session_tree", () => model.requestRender());
	pi.on("model_select", () => model.requestRender());
	pi.on("thinking_level_select", () => model.requestRender());
	pi.on("message_start", (event) => {
		if (event.message.role === "assistant") model.setAnswerStreaming(true);
		else model.requestRender();
	});
	pi.on("message_end", (event) => {
		if (event.message.role === "assistant") model.setAnswerStreaming(false);
		else model.requestRender();
	});

	pi.registerShortcut("f2", {
		description: "Toggle the bottom dashboard",
		handler: (ctx) => {
			if (ctx.mode !== "tui") return;
			if (!model.config.enabled) {
				ctx.ui.notify("bottom is off. Run /bottom on to enable it.", "info");
				return;
			}
			toggleDashboard(model, ctx);
		},
	});

	pi.registerCommand("bottom", {
		description: "Configure the bottom chrome: on|off, dashboard, icons, frame, spinner, reset",
		handler: async (args, ctx) => {
			const [rawCommand, rawValue, rawExtra] = args.trim().split(/\s+/);
			const command = rawCommand?.toLowerCase();

			if (!command || command === "status") {
				ctx.ui.notify(describe(model.config), "info");
				return;
			}

			let needsApply = false;

			switch (command) {
				case "on":
					model.config.enabled = true;
					needsApply = true;
					break;
				case "off":
					model.config.enabled = false;
					needsApply = true;
					break;
				case "dashboard":
				case "dash":
					toggleDashboard(model, ctx, false);
					break;
				case "icons": {
					const value = rawValue?.toLowerCase();
					if (value !== "unicode" && value !== "ascii" && value !== "nerd") {
						ctx.ui.notify("Usage: /bottom icons unicode|ascii|nerd", "warning");
						return;
					}
					model.config.icons = value as IconSet;
					break;
				}
				case "frame": {
					const value = rawValue?.toLowerCase();
					if (value && value !== "on" && value !== "off") {
						ctx.ui.notify("Usage: /bottom frame [on|off]", "warning");
						return;
					}
					model.config.frameEditor = value ? value === "on" : !model.config.frameEditor;
					needsApply = true;
					break;
				}
				case "spinner": {
					const value = rawValue?.toLowerCase();
					if (value && value !== "on" && value !== "off") {
						ctx.ui.notify("Usage: /bottom spinner [on|off]", "warning");
						return;
					}
					model.config.spinner = value ? value === "on" : !model.config.spinner;
					break;
				}
				case "placement": {
					const value = rawValue?.toLowerCase();
					if (value !== "above" && value !== "below") {
						ctx.ui.notify("Usage: /bottom placement above|below", "warning");
						return;
					}
					model.config.dashboardPlacement =
						value === "below" ? "belowEditor" : "aboveEditor";
					needsApply = true;
					break;
				}
				case "show": {
					const keys = Object.keys(model.config.show) as (keyof BottomConfig["show"])[];
					const key = rawValue?.toLowerCase() as keyof BottomConfig["show"] | undefined;
					if (!key || !keys.includes(key)) {
						ctx.ui.notify(`Usage: /bottom show <${keys.join("|")}> [on|off]`, "warning");
						return;
					}
					const value = rawExtra?.toLowerCase();
					if (value && value !== "on" && value !== "off") {
						ctx.ui.notify("Usage: /bottom show <segment> [on|off]", "warning");
						return;
					}
					model.config.show[key] = value
						? value === "on"
						: !model.config.show[key];
					break;
				}
				case "reset":
					model.config = resetConfig();
					needsApply = true;
					break;
				case "config":
					saveConfig(model.config);
					ctx.ui.notify(`Saved ${configPath()}`, "info");
					return;
				default:
					ctx.ui.notify(
						"Usage: /bottom [status|on|off|dashboard|icons unicode|ascii|nerd|frame on|off|spinner on|off|placement above|below|show <segment> on|off|reset|config]",
						"warning",
					);
					return;
			}

			if (!saveConfig(model.config)) {
				ctx.ui.notify(`Could not write ${configPath()}`, "warning");
			}
			if (needsApply) apply(ctx);
			else model.requestRender();
			ctx.ui.notify(describe(model.config), "info");
		},
	});
}

function toggleDashboard(
	model: BottomModel,
	ctx: ExtensionContext,
	notify = true,
): void {
	const next: DashboardMode = model.dashboardVisible ? "off" : "on";
	model.config.dashboard = next;
	if (!saveConfig(model.config)) {
		ctx.ui.notify(`Could not write ${configPath()}`, "warning");
	}
	model.requestRender();
	if (notify) ctx.ui.notify(`bottom dashboard: ${next}`, "info");
}

function describe(config: BottomConfig): string {
	const dashboard =
		config.dashboard === "auto"
			? "auto"
			: config.dashboard === "on"
				? "on"
				: "off";
	return [
		`bottom: ${config.enabled ? "on" : "off"}`,
		`dashboard ${dashboard}`,
		`icons ${config.icons}`,
		`frame ${config.frameEditor ? "on" : "off"}`,
		`spinner ${config.spinner ? "on" : "off"}`,
		`dash ${config.dashboardPlacement === "belowEditor" ? "below" : "above"}`,
	].join(" · ");
}
