import { isAbsolute, relative, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { sliceByColumn, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const MAX_EXPANDED_LINES = 200;

const STYLED_TOOLS = new Set(["read", "bash", "edit", "write", "grep", "find", "ls"]);

type Theme = {
  fg(token: string, text: string): string;
  bold(text: string): string;
};

type ContentBlock = { type: string; text?: string };

type Result = {
  content?: ContentBlock[];
  details?: Record<string, unknown>;
};

type View = {
  name: string;
  args: Record<string, unknown>;
  cwd: string;
  theme: Theme;
  outputPad: number;
  expanded: boolean;
  isPartial: boolean;
  isError: boolean;
  durationMs: number | undefined;
  result: Result | undefined;
};

type Row = {
  label: string;
  target: string;
  facts: string[];
  failed: boolean;
  handledError: boolean;
  detail: string;
  items?: string[];
  output: string[];
};

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function shortPath(path: string, cwd: string): string {
  if (!path) return "";
  const absolute = isAbsolute(path) ? path : resolve(cwd, path);
  const relativePath = relative(cwd, absolute);
  return relativePath && !relativePath.startsWith("..") ? relativePath : absolute;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function countLines(text: string): number {
  const trimmed = text.replace(/\s+$/, "");
  return trimmed ? trimmed.split("\n").length : 0;
}

function seconds(durationMs: number | undefined): string[] {
  if (durationMs === undefined) return [];
  const value = durationMs < 10000 ? (durationMs / 1000).toFixed(1) : Math.round(durationMs / 1000).toString();
  return [`${value}s`];
}

function fitLeft(text: string, budget: number): string {
  if (budget <= 0) return "";
  const width = visibleWidth(text);
  if (width <= budget) return text;
  if (budget === 1) return "…";
  return "…" + sliceByColumn(text, width - budget + 1, budget - 1, true);
}

function packItems(items: string[], budget: number): string {
  let packed = "";
  for (let index = 0; index < items.length; index++) {
    const rest = items.length - index - 1;
    const candidate = packed ? `${packed}, ${items[index]}` : items[index];
    const tail = rest > 0 ? `, +${rest} more` : "";
    if (visibleWidth(candidate) + visibleWidth(tail) > budget) {
      if (!packed) return truncateToWidth(candidate, budget, "…");
      return `${packed}, +${rest + 1} more`;
    }
    packed = candidate;
  }
  return packed;
}

function resultText(result: Result | undefined): string {
  if (!result?.content) return "";
  return result.content
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text as string)
    .join("\n");
}

function payload(text: string): string {
  return text.split(/\n\n\[/)[0];
}

function truncatedBy(details: unknown): { outputLines?: number; totalLines?: number; truncated?: boolean } | undefined {
  if (!details || typeof details !== "object") return undefined;
  const truncation = (details as Record<string, unknown>).truncation;
  return truncation && typeof truncation === "object" ? (truncation as { outputLines?: number; totalLines?: number; truncated?: boolean }) : undefined;
}

function cappedBy(details: unknown): boolean {
  if (!details || typeof details !== "object") return false;
  const record = details as Record<string, unknown>;
  return record.matchLimitReached !== undefined || record.resultLimitReached !== undefined || record.entryLimitReached !== undefined || truncatedBy(details)?.truncated === true;
}

function outputLines(text: string): string[] {
  const lines = text.replace(/\r/g, "").split("\n");
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function firstLine(text: string): string {
  return outputLines(text)[0] ?? "";
}

function readRow(view: View): Row {
  const args = view.args;
  const rangeParts = [
    args.offset != null ? `offset=${args.offset}` : "",
    args.limit != null ? `limit=${args.limit}` : "",
  ].filter(Boolean);
  const row: Row = {
    label: "Read",
    target: shortPath(str(args.path), view.cwd) + (rangeParts.length ? ` (${rangeParts.join(", ")})` : ""),
    facts: [],
    failed: false,
    handledError: false,
    detail: "",
    output: [],
  };
  if (view.result) row.output = outputLines(resultText(view.result));
  if (view.result && !view.isError) {
    const truncation = truncatedBy(view.result.details);
    if (truncation?.truncated) {
      row.facts.push(`${truncation.outputLines} of ${truncation.totalLines} lines`);
    } else {
      const lines = countLines(payload(resultText(view.result)));
      if (lines > 0) row.facts.push(`${lines} lines`);
    }
  }
  return row;
}

function bashRow(view: View): Row {
  const text = resultText(view.result);
  const row: Row = {
    label: "Bash",
    target: collapse(str(view.args.command)),
    facts: [],
    failed: false,
    handledError: view.result !== undefined && !view.isPartial,
    detail: "",
    output: [],
  };
  if (view.result && !view.isPartial) {
    row.facts.push(...seconds(view.durationMs));
    const exitCode = /Command exited with code (\d+)/.exec(text);
    if (exitCode) row.facts.push(`exit ${exitCode[1]}`);
    else if (/Command timed out/.test(text)) row.facts.push("timed out");
    else if (/Command aborted/.test(text)) row.facts.push("aborted");
    else if (!view.isError) row.facts.push("exit 0");
    const tail = outputLines(payload(text))
      .filter((line) => !/^Command (exited|timed out|aborted|terminated)/.test(line))
      .filter((line) => line !== "(no output)")
      .slice(-2);
    row.detail = tail.join(" · ");
  }
  if (view.result) row.output = outputLines(text);
  return row;
}

function editRow(view: View): Row {
  const row: Row = {
    label: "Edit",
    target: shortPath(str(view.args.path), view.cwd),
    facts: [],
    failed: false,
    handledError: false,
    detail: "",
    output: outputLines(resultText(view.result)),
  };
  const diff = str(view.result?.details?.diff);
  if (diff) {
    const added = diff.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
    const removed = diff.split("\n").filter((line) => line.startsWith("-") && !line.startsWith("---")).length;
    row.facts.push(`+${added} −${removed}`);
  }
  return row;
}

function writeRow(view: View): Row {
  const lines = countLines(str(view.args.content));
  return {
    label: "Write",
    target: shortPath(str(view.args.path), view.cwd),
    facts: lines > 0 ? [`${lines} lines`] : [],
    failed: false,
    handledError: false,
    detail: "",
    output: outputLines(resultText(view.result)),
  };
}

function searchTarget(args: Record<string, unknown>, view: View): string {
  const pattern = str(args.pattern);
  const path = str(args.path);
  const where = path && path !== "." ? ` in ${shortPath(path, view.cwd)}` : "";
  return `(${pattern})${where}`;
}

function grepRow(view: View): Row {
  const text = resultText(view.result);
  const row: Row = {
    label: "Grep",
    target: searchTarget(view.args, view),
    facts: [],
    failed: false,
    handledError: false,
    detail: "",
    output: outputLines(text),
  };
  if (view.result && !view.isError) {
    if (!text.trim()) {
      row.facts.push("no matches");
      return row;
    }
    const matches: Array<{ path: string; line: string }> = [];
    for (const line of outputLines(text)) {
      const match = /^(.+?):(\d+):/.exec(line);
      if (match) matches.push({ path: match[1], line: match[2] });
    }
    const files = new Set(matches.map((match) => match.path));
    const capped = cappedBy(view.result.details) ? "+" : "";
    if (matches.length === 0) {
      row.facts.push(`${countLines(payload(text))} lines`);
    } else {
      row.facts.push(`${matches.length}${capped} ${matches.length === 1 && !capped ? "match" : "matches"} in ${files.size} ${files.size === 1 ? "file" : "files"}`);
      row.items = matches.map((match) => `${match.path}:${match.line}`);
    }
  }
  return row;
}

function findRow(view: View): Row {
  const row: Row = {
    label: "Find",
    target: searchTarget(view.args, view),
    facts: [],
    failed: false,
    handledError: false,
    detail: "",
    output: outputLines(resultText(view.result)),
  };
  if (view.result && !view.isError) {
    const count = outputLines(payload(resultText(view.result))).length;
    const capped = cappedBy(view.result.details) ? "+" : "";
    row.facts.push(`${count}${capped} ${count === 1 && !capped ? "file" : "files"}`);
  }
  return row;
}

function lsRow(view: View): Row {
  const row: Row = {
    label: "List",
    target: shortPath(str(view.args.path) || ".", view.cwd),
    facts: [],
    failed: false,
    handledError: false,
    detail: "",
    output: outputLines(resultText(view.result)),
  };
  if (view.result && !view.isError) {
    const count = outputLines(payload(resultText(view.result))).length;
    const capped = cappedBy(view.result.details) ? "+" : "";
    row.facts.push(`${count}${capped} ${count === 1 && !capped ? "entry" : "entries"}`);
  }
  return row;
}

function describe(view: View): Row {
  const builders: Record<string, (view: View) => Row> = {
    read: readRow,
    bash: bashRow,
    edit: editRow,
    write: writeRow,
    grep: grepRow,
    find: findRow,
    ls: lsRow,
  };
  const row = builders[view.name](view);
  if (view.isError && !row.handledError) {
    row.failed = true;
    if (!row.detail) row.detail = firstLine(resultText(view.result));
  }
  return row;
}

function renderLines(view: View, width: number): string[] {
  const theme = view.theme;
  const pad = " ".repeat(view.outputPad);
  const row = describe(view);
  const settled = view.result !== undefined && !view.isPartial;
  const glyph = settled ? "●" : "○";
  const glyphColor = view.isError ? "error" : settled ? "success" : "warning";
  const head = `${theme.fg(glyphColor, glyph)} ${theme.fg("toolTitle", theme.bold(row.label))} `;
  const factsText = row.facts.length ? theme.fg("muted", ` · ${row.facts.join(" · ")}`) : "";
  const failedText = row.failed ? theme.fg("error", " · failed") : "";
  const budget = width - pad.length - visibleWidth(head) - visibleWidth(factsText) - visibleWidth(failedText);
  const line = pad + head + fitLeft(row.target, budget) + factsText + failedText;
  const lines = [truncateToWidth(line, width, "…")];
  const indent = `${pad}  `;
  const detailBudget = Math.max(0, width - visibleWidth(indent));
  if (view.expanded) {
    for (const outputLine of row.output.slice(0, MAX_EXPANDED_LINES)) {
      lines.push(indent + truncateToWidth(theme.fg("toolOutput", outputLine), detailBudget, "…"));
    }
    if (row.output.length > MAX_EXPANDED_LINES) {
      lines.push(indent + theme.fg("muted", `… ${row.output.length - MAX_EXPANDED_LINES} more lines`));
    }
    return lines;
  }
  const detail = row.items ? packItems(row.items, detailBudget) : row.detail;
  if (detail) {
    lines.push(indent + truncateToWidth(theme.fg("dim", detail), detailBudget, "…"));
  }
  return lines;
}

export default function (pi: ExtensionAPI) {
  pi.registerToolRenderer((toolName, next) => {
    if (!STYLED_TOOLS.has(toolName)) return next();
    return {
      renderShell: "self",
      renderCall(args, theme, context) {
        const state = context.state as { view?: View };
        const view: View = state.view ?? (state.view = {} as View);
        view.name = toolName;
        view.args = args as Record<string, unknown>;
        view.cwd = context.cwd;
        view.theme = theme as Theme;
        view.outputPad = context.outputPad;
        view.expanded = context.expanded;
        view.isPartial = context.isPartial;
        view.isError = context.isError;
        view.durationMs = context.durationMs;
        return {
          render: (width: number) => renderLines(view, width),
          invalidate: () => {},
        };
      },
      renderResult(result, options, theme, context) {
        const state = context.state as { view?: View };
        const view: View = state.view ?? (state.view = {} as View);
        view.result = result as Result;
        view.theme = theme as Theme;
        view.expanded = options.expanded;
        view.isPartial = context.isPartial;
        view.isError = context.isError;
        view.durationMs = context.durationMs;
        return {
          render: () => [] as string[],
          invalidate: () => {},
        };
      },
    };
  });
}
