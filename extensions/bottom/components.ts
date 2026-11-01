import {
	CustomEditor,
	type KeybindingsManager,
	type ReadonlyFooterDataProvider,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import {
	type Component,
	type EditorTheme,
	type TUI,
	sliceByColumn,
	visibleWidth,
} from "@earendil-works/pi-tui";
import { getIcons } from "./format";
import type { BottomModel } from "./state";
import { renderBottomBorder as renderBottom, renderDashboard, renderFooterLine, renderTopBorder as renderTop } from "./render";

export class BottomFooter implements Component {
	private unsubscribe?: () => void;

	constructor(
		private model: BottomModel,
		private theme: Theme,
		private footerData: ReadonlyFooterDataProvider,
	) {
		model.footerData = footerData;
		model.branch = footerData.getGitBranch();
		void model.refreshGit(true);
		this.unsubscribe = footerData.onBranchChange(() => {
			model.branch = footerData.getGitBranch();
			void model.refreshGit(true);
			model.requestRender();
		});
	}

	invalidate(): void {}

	render(width: number): string[] {
		if (width <= 0) return [];
		return [renderFooterLine(this.model, this.theme, width)];
	}

	dispose(): void {
		this.unsubscribe?.();
		this.unsubscribe = undefined;
	}
}

export class BottomDashboard implements Component {
	constructor(
		private model: BottomModel,
		private fullTheme: Theme,
	) {}

	invalidate(): void {}

	render(width: number): string[] {
		if (width <= 0) return [];
		return renderDashboard(this.model, this.fullTheme, width);
	}

	dispose(): void {}
}

export class BottomEditor extends CustomEditor {
	constructor(
		tui: TUI,
		editorTheme: EditorTheme,
		keybindings: KeybindingsManager,
		private model: BottomModel,
		private fullTheme: Theme,
	) {
		super(tui, editorTheme, keybindings, { paddingX: 2 });
		model.tui = tui;
	}

	setPaddingX(padding: number): void {
		// Pi restores the user's editorPaddingX setting when installing a custom
		// editor. The frame needs at least two columns: one for the side border
		// and one so text never touches it.
		super.setPaddingX(Math.max(2, padding));
	}

	protected renderTopBorder(width: number, hiddenLineCount: number): string {
		return renderTop(this.model, this.fullTheme, this.borderColor, width, hiddenLineCount);
	}

	protected renderBottomBorder(width: number, hiddenLineCount: number): string {
		return renderBottom(this.model, this.fullTheme, this.borderColor, width, hiddenLineCount);
	}

	render(width: number): string[] {
		const lines = super.render(width);
		const count = contentLineCount(this, lines.length);
		if (width < 8 || count <= 0) return lines;

		const edge = this.borderColor(getIcons(this.model.config.icons).v);
		const innerWidth = Math.max(0, width - 2);
		const padding = Math.min(this.getPaddingX(), Math.floor((width - 1) / 2));
		const start = Math.max(0, padding - 1);
		for (let index = 1; index <= count && index < lines.length; index++) {
			const line = lines[index];
			if (line === undefined) break;
			const body = sliceByColumn(line, start, innerWidth, true);
			const fill = " ".repeat(Math.max(0, innerWidth - visibleWidth(body)));
			lines[index] = edge + body + fill + edge;
		}
		return lines;
	}
}

/**
 * The editor stores the number of visible content rows privately; reading it is
 * the only reliable way to tell content rows from the autocomplete rows that
 * follow the bottom border.
 */
function contentLineCount(editor: BottomEditor, fallback: number): number {
	const value = (editor as unknown as { renderedVisibleLineCount?: unknown }).renderedVisibleLineCount;
	if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
	return Math.max(0, fallback - 2);
}
