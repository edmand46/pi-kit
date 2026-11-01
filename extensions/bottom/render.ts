import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
	EMPTY_RATE,
	formatCost,
	formatDuration,
	formatRateValue,
	formatTokens,
	gauge,
	gaugeColor,
	getIcons,
	sanitizeStatus,
	shortenPath,
	type Icons,
} from "./format";
import type { BottomModel } from "./state";
import { thinkingColor } from "./state";

interface Segment {
	text: string;
	priority: number;
}

const STATUS_PRIORITY = 55;

export function renderFooterLine(
	model: BottomModel,
	theme: Theme,
	width: number,
): string {
	const snapshot = model.snapshot();
	const icons = getIcons(model.config.icons);
	const left: Segment[] = [];
	const right: Segment[] = [];
	const show = model.config.show;

	if (show.ctx) {
		const percent = snapshot.contextPercent;
		const label = theme.fg("dim", "ctx ");
		if (percent === null) {
			const window = snapshot.contextWindow > 0 ? `/${formatTokens(snapshot.contextWindow)}` : "";
			left.push({ text: label + theme.fg("muted", `?${window}`), priority: 100 });
		} else {
			const text =
				label +
				theme.fg(gaugeColor(percent), `${Math.round(percent)}%`) +
				" " +
				gauge(percent, theme, icons);
			left.push({ text, priority: 100 });
		}
	}

	if (show.tokens && (snapshot.usage.input > 0 || snapshot.usage.output > 0)) {
		left.push({
			text: theme.fg(
				"muted",
				`${icons.up}${formatTokens(snapshot.usage.input)} ${icons.down}${formatTokens(snapshot.usage.output)}`,
			),
			priority: 80,
		});
	}

	if (show.tps) {
		const last = formatRateValue(snapshot.streamingAnswer ? undefined : snapshot.tpsLast);
		const average = formatRateValue(snapshot.tpsAverage);
		const averageText =
			average === EMPTY_RATE ? "" : theme.fg("dim", icons.sep) + theme.fg("muted", `avg ${average}`);
		left.push({ text: theme.fg("muted", `${last} t/s`) + averageText, priority: 75 });
	}

	if (show.cache && snapshot.usage.cacheHitRate !== undefined) {
		left.push({
			text: theme.fg("dim", `${icons.cache} ${Math.round(snapshot.usage.cacheHitRate)}%`),
			priority: 40,
		});
	}

	if (show.cost && snapshot.usage.cost > 0) {
		left.push({ text: theme.fg("muted", formatCost(snapshot.usage.cost)), priority: 70 });
	}

	if (show.statuses && model.footerData) {
		const statuses = [...model.footerData.getExtensionStatuses().entries()].sort(([a], [b]) =>
			a.localeCompare(b),
		);
		for (const [, value] of statuses) {
			const clean = sanitizeStatus(value);
			if (clean) right.push({ text: clean, priority: STATUS_PRIORITY });
		}
	}

	if (show.clock) {
		const clock = snapshot.clock;
		const mark = clock.peak ? icons.peak : icons.offPeak;
		const state = clock.peak ? "peak" : "off-peak";
		right.push({
			text:
				theme.fg("dim", clock.time) +
				" " +
				theme.fg(clock.peak ? "warning" : "dim", mark ? `${mark} ${state}` : state),
			priority: 95,
		});
		right.push({
			text: theme.fg(
				"dim",
				clock.windows
					? `${icons.clock}${icons.clock ? " " : ""}${clock.windows}`
					: "weekend",
			),
			priority: 20,
		});
	}

	return layoutSegments(left, right, width, theme, icons);
}

export function renderTopBorder(
	model: BottomModel,
	theme: Theme,
	borderColor: (text: string) => string,
	width: number,
	hiddenLineCount: number,
): string {
	const snapshot = model.snapshot();
	const icons = getIcons(model.config.icons);
	const left: Segment[] = [];
	const right: Segment[] = [];
	const show = model.config.show;

	if (snapshot.compacting) {
		left.push({ text: theme.fg("warning", `${spinnerFrame(model, icons)} compacting`), priority: 100 });
	} else if (snapshot.working) {
		left.push({ text: theme.fg("accent", `${spinnerFrame(model, icons)} working`), priority: 100 });
	}

	if (show.model && snapshot.modelId) {
		const multipleProviders = (model.footerData?.getAvailableProviderCount() ?? 0) > 1;
		const label = multipleProviders ? `${snapshot.provider}/${snapshot.modelId}` : snapshot.modelId;
		left.push({ text: theme.bold(theme.fg("text", label)), priority: 85 });
	}

	if (show.thinking && snapshot.reasoning) {
		left.push({ text: theme.fg(thinkingColor(snapshot.thinking), snapshot.thinking), priority: 60 });
	}

	if (show.tool && snapshot.tools.length > 0) {
		const now = Date.now();
		const parts = snapshot.tools.slice(0, 2).map((tool) => {
			const label = tool.label ? ` ${theme.fg("muted", tool.label)}` : "";
			return (
				theme.fg("toolTitle", tool.name) +
				label +
				" " +
				theme.fg("dim", formatDuration(now - tool.startedAt))
			);
		});
		if (snapshot.tools.length > 2) parts.push(theme.fg("dim", `+${snapshot.tools.length - 2}`));
		right.push({ text: parts.join(theme.fg("dim", " · ")), priority: 80 });
	}

	if (hiddenLineCount > 0) {
		right.unshift({ text: theme.fg("muted", `${icons.up} ${hiddenLineCount} more`), priority: 110 });
	}

	return borderLine(
		left.map((part) => part.text).join(theme.fg("dim", icons.sep)),
		right.map((part) => part.text).join(theme.fg("dim", icons.sep)),
		width,
		borderColor,
		icons,
		"top",
	);
}

export function renderBottomBorder(
	model: BottomModel,
	theme: Theme,
	borderColor: (text: string) => string,
	width: number,
	hiddenLineCount: number,
): string {
	const snapshot = model.snapshot();
	const icons = getIcons(model.config.icons);
	const left: Segment[] = [];
	const right: Segment[] = [];
	const show = model.config.show;
	const git = snapshot.git;

	if (show.cwd) {
		left.push({ text: theme.fg("muted", shortenPath(snapshot.cwd)), priority: 90 });
	}

	if (show.git && snapshot.branch) {
		let branch = theme.fg("accent", snapshot.branch);
		const dirty = git.changed + git.untracked;
		if (dirty > 0) branch += theme.fg("warning", "*");
		if (git.ahead > 0 || git.behind > 0) {
			branch += theme.fg("dim", ` ${icons.up}${git.ahead} ${icons.down}${git.behind}`);
		}
		left.push({ text: branch, priority: 80 });
	}

	if (show.git && git.isRepo && git.changed + git.untracked > 0) {
		left.push({
			text: theme.fg("warning", `±${git.changed + git.untracked}`),
			priority: 45,
		});
	}

	if (show.git && git.isRepo && (git.added > 0 || git.removed > 0)) {
		left.push({
			text: theme.fg("success", `+${git.added}`) + " " + theme.fg("error", `-${git.removed}`),
			priority: 40,
		});
	}

	if (show.session) {
		const timer = icons.timer ? `${icons.timer} ` : "";
		right.push({
			text: theme.fg("dim", `${timer}${formatDuration(snapshot.sessionElapsedMs)}`),
			priority: 75,
		});
		if (snapshot.sessionName) {
			right.push({ text: theme.fg("muted", snapshot.sessionName), priority: 65 });
		}
	}

	if (hiddenLineCount > 0) {
		right.unshift({ text: theme.fg("muted", `${icons.down} ${hiddenLineCount} more`), priority: 110 });
	}

	return borderLine(
		left.map((part) => part.text).join(theme.fg("dim", icons.sep)),
		right.map((part) => part.text).join(theme.fg("dim", icons.sep)),
		width,
		borderColor,
		icons,
		"bottom",
	);
}

export function renderDashboard(model: BottomModel, theme: Theme, width: number): string[] {
	if (!model.dashboardVisible) return [];
	const snapshot = model.snapshot();
	const icons = getIcons(model.config.icons);
	const bar = theme.fg("borderMuted", icons.bar);
	const innerWidth = Math.max(0, width - 2);
	if (innerWidth <= 0) return [];

	const activity: Segment[] = [];
	const activityRight: Segment[] = [];
	const repo: Segment[] = [];
	const repoRight: Segment[] = [];

	const now = Date.now();
	if (model.config.show.tool) {
		for (const tool of snapshot.tools) {
			const label = tool.label ? ` ${theme.fg("muted", tool.label)}` : "";
			activity.push({
				text:
					theme.fg("toolTitle", tool.name) +
					label +
					" " +
					theme.fg("dim", formatDuration(now - tool.startedAt)),
				priority: 70,
			});
		}
	}

	if (activity.length === 0) {
		activity.push({
			text: theme.fg("muted", `turn ${snapshot.turnCount}`),
			priority: 50,
		});
		if (model.config.show.tool && snapshot.lastTool) {
			const mark = snapshot.lastTool.ok
				? theme.fg("success", icons.check)
				: theme.fg("error", icons.cross);
			const name = theme.fg("muted", snapshot.lastTool.name);
			const duration = snapshot.lastTool.durationMs
				? " " + theme.fg("dim", formatDuration(snapshot.lastTool.durationMs))
				: "";
			activity.push({ text: `${mark} ${name}${duration}`, priority: 45 });
		}
		if (model.config.show.tool && snapshot.toolSuccess + snapshot.toolFailure > 0) {
			activityRight.push({
				text:
					theme.fg("success", `${icons.check}${snapshot.toolSuccess}`) +
					" " +
					theme.fg("error", `${icons.cross}${snapshot.toolFailure}`),
				priority: 55,
			});
		}
	}

	if (snapshot.pending) {
		activityRight.push({ text: theme.fg("warning", "queued"), priority: 90 });
	}

	const git = snapshot.git;
	if (model.config.show.git) {
		if (snapshot.branch) {
			let branch = theme.fg("accent", snapshot.branch);
			const dirty = git.changed + git.untracked;
			if (dirty > 0) branch += theme.fg("warning", "*");
			if (git.ahead > 0 || git.behind > 0) {
				branch += theme.fg("dim", ` ${icons.up}${git.ahead} ${icons.down}${git.behind}`);
			}
			repo.push({ text: branch, priority: 80 });
		}

		if (git.changed + git.untracked > 0) {
			repo.push({
				text: theme.fg("warning", `${git.changed + git.untracked} changed`),
				priority: 60,
			});
		}

		if (git.added > 0 || git.removed > 0) {
			repo.push({
				text: theme.fg("success", `+${git.added}`) + " " + theme.fg("error", `-${git.removed}`),
				priority: 50,
			});
		}

		if (repo.length === 0) {
			repo.push({ text: theme.fg("dim", "no git"), priority: 30 });
		}
	}

	if (model.config.show.session && snapshot.lastTurnMs !== undefined) {
		repoRight.push({
			text: theme.fg("dim", `last turn ${formatDuration(snapshot.lastTurnMs)}`),
			priority: 55,
		});
	}

	const line1 = layoutSegments(activity, activityRight, innerWidth, theme, icons);
	const line2 = layoutSegments(repo, repoRight, innerWidth, theme, icons);
	const lines: string[] = [];
	if (line1) lines.push(`${bar} ${line1}`);
	if (line2) lines.push(`${bar} ${line2}`);
	return lines;
}

function spinnerFrame(model: BottomModel, icons: Icons): string {
	if (!model.config.spinner) return icons.bullet;
	const index = Math.floor(Date.now() / 90) % icons.spinner.length;
	return icons.spinner[index] ?? icons.bullet;
}

function borderLine(
	left: string,
	right: string,
	width: number,
	color: (text: string) => string,
	icons: Icons,
	kind: "top" | "bottom",
): string {
	if (width <= 0) return "";
	if (width < 8) return color(icons.h.repeat(width));

	const [leftCorner, rightCorner] = kind === "top" ? [icons.tl, icons.tr] : [icons.bl, icons.br];
	let leftText = left;
	let rightText = right;
	let leftWidth = visibleWidth(leftText);
	let rightWidth = visibleWidth(rightText);

	const paddingFor = (text: string): number => (text ? 2 : 0);
	let available = width - 4 - paddingFor(leftText) - paddingFor(rightText);
	if (leftWidth + rightWidth > available) {
		if (rightText) {
			const maxRight = Math.max(0, width - 4 - paddingFor(leftText) - 2 - leftWidth);
			rightText = truncateToWidth(rightText, maxRight, icons.ellipsis, false);
			rightWidth = visibleWidth(rightText);
		}
		available = width - 4 - paddingFor(leftText) - paddingFor(rightText);
		if (leftText && leftWidth + rightWidth > available) {
			const maxLeft = Math.max(0, width - 4 - paddingFor(rightText) - 2 - rightWidth);
			leftText = truncateToWidth(leftText, maxLeft, icons.ellipsis, false);
			leftWidth = visibleWidth(leftText);
		}
	}

	const fill = Math.max(
		0,
		width - 4 - paddingFor(leftText) - paddingFor(rightText) - leftWidth - rightWidth,
	);
	const body =
		(leftText ? ` ${leftText} ` : "") +
		color(icons.h.repeat(fill)) +
		(rightText ? ` ${rightText} ` : "");

	return color(leftCorner) + color(icons.h) + body + color(icons.h) + color(rightCorner);
}

function layoutSegments(
	leftInput: Segment[],
	rightInput: Segment[],
	width: number,
	theme: Theme,
	icons: Icons,
): string {
	const left = leftInput.filter((segment) => segment.text.length > 0);
	const right = rightInput.filter((segment) => segment.text.length > 0);
	const separator = theme.fg("dim", icons.sep);
	const separatorWidth = visibleWidth(icons.sep);
	const measure = (segments: Segment[]): number =>
		segments.reduce((total, segment) => total + visibleWidth(segment.text), 0) +
		Math.max(0, segments.length - 1) * separatorWidth;

	while (
		left.length + right.length > 1 &&
		measure(left) + measure(right) + (left.length > 0 && right.length > 0 ? 1 : 0) > width
	) {
		let victim: { list: Segment[]; index: number; priority: number; side: number } | undefined;
		const consider = (list: Segment[], side: number): void => {
			for (let index = 0; index < list.length; index++) {
				const segment = list[index];
				if (!segment) continue;
				if (
					!victim ||
					segment.priority < victim.priority ||
					(segment.priority === victim.priority && side > victim.side) ||
					(segment.priority === victim.priority && side === victim.side && index > victim.index)
				) {
					victim = { list, index, priority: segment.priority, side };
				}
			}
		};
		consider(left, 0);
		consider(right, 1);
		if (!victim) break;
		victim.list.splice(victim.index, 1);
	}

	let leftText = left.map((segment) => segment.text).join(separator);
	let rightText = right.map((segment) => segment.text).join(separator);
	let leftWidth = visibleWidth(leftText);
	let rightWidth = visibleWidth(rightText);

	if (leftWidth + rightWidth > width) {
		const availableRight = Math.max(0, width - leftWidth - (leftWidth > 0 ? 1 : 0));
		rightText = truncateToWidth(rightText, availableRight, icons.ellipsis, false);
		rightWidth = visibleWidth(rightText);
		if (leftText && leftWidth + rightWidth > width) {
			const availableLeft = Math.max(0, width - rightWidth - (rightWidth > 0 ? 1 : 0));
			leftText = truncateToWidth(leftText, availableLeft, icons.ellipsis, false);
			leftWidth = visibleWidth(leftText);
		}
	}

	let result: string;
	if (!leftText) result = rightText ? " ".repeat(Math.max(0, width - rightWidth)) + rightText : "";
	else if (!rightText) result = leftText;
	else result = leftText + " ".repeat(Math.max(1, width - leftWidth - rightWidth)) + rightText;

	return visibleWidth(result) <= width ? result : truncateToWidth(result, width, icons.ellipsis, true);
}
