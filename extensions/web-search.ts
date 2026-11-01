import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Result = { title: string; url: string; snippet: string; date?: string };

const TIMEOUT_MS = 20_000;
const MAX_SNIPPET = 300;

function clean(text: unknown): string {
  return String(text ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SNIPPET);
}

function label(result: { title: string; url: string }): string {
  if (result.title.trim()) return result.title.trim();
  try {
    const url = new URL(result.url);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return result.url;
  }
}

// pi exports a possibly stale DEEPSEEK_API_KEY; its stored credential is authoritative.
async function deepseekKey(): Promise<string | undefined> {
  try {
    const auth = JSON.parse(await readFile(join(homedir(), ".pi", "agent", "auth.json"), "utf8"));
    const key = auth?.deepseek?.key;
    if (typeof key === "string" && key.length > 0) return key;
  } catch {}
  return process.env.DEEPSEEK_API_KEY;
}

async function brave(query: string, count: number, signal: AbortSignal): Promise<Result[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) throw new Error("BRAVE_SEARCH_API_KEY is not set");
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));
  const res = await fetch(url, {
    headers: { Accept: "application/json", "X-Subscription-Token": key },
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`brave ${res.status}: ${data?.error?.detail ?? res.statusText}`);
  return (data?.web?.results ?? []).map((r: Record<string, unknown>) => ({
    title: label({ title: String(r.title ?? ""), url: String(r.url ?? "") }),
    url: String(r.url ?? ""),
    snippet: clean(r.description),
  }));
}

async function deepseek(query: string, count: number, signal: AbortSignal): Promise<Result[]> {
  const key = await deepseekKey();
  if (!key) throw new Error("DEEPSEEK_API_KEY is not set");
  const res = await fetch("https://api.deepseek.com/v1/tools/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, count }),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`deepseek ${res.status}: ${data?.error?.message ?? res.statusText}`);
  return (data?.results ?? []).map((r: Record<string, unknown>) => ({
    title: label({ title: String(r.title ?? ""), url: String(r.url ?? "") }),
    url: String(r.url ?? ""),
    snippet: clean(r.snippet || r.summary),
    date: typeof r.date === "string" ? r.date.slice(0, 10) : undefined,
  }));
}

const searchTool = defineTool({
  name: "web_search",
  label: "Web Search",
  description: "Search the web and return top results as title, URL and snippet. Brave by default, DeepSeek as fallback.",
  promptSnippet: "Search the web and return titles, URLs and snippets",
  promptGuidelines: [
    "Use web_search for news, current facts and external docs; cite the URLs it returns.",
    "Prefer web_search over scraping search engines with obscura; use obscura only to open or interact with a page.",
  ],
  parameters: Type.Object({
    query: Type.String({ description: "Search query; DeepSeek supports site:, lang:, after: and before: operators" }),
    count: Type.Optional(Type.Integer({ minimum: 1, maximum: 20, description: "Number of results, default 5" })),
    provider: Type.Optional(
      Type.Union([Type.Literal("auto"), Type.Literal("brave"), Type.Literal("deepseek")], {
        description: "Backend; auto tries Brave and falls back to DeepSeek (default auto)",
      }),
    ),
  }),

  async execute(_toolCallId, params, signal) {
    const query = params.query.trim();
    if (!query) throw new Error("query must not be empty");
    const count = Math.min(Math.max(params.count ?? 5, 1), 20);
    const provider = params.provider ?? "auto";
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const abort = AbortSignal.any([signal, timeout]);

    const attempts: Array<["brave" | "deepseek", () => Promise<Result[]>]> = [];
    if (provider !== "deepseek") attempts.push(["brave", () => brave(query, count, abort)]);
    if (provider !== "brave") attempts.push(["deepseek", () => deepseek(query, count, abort)]);

    const errors: string[] = [];
    for (const [name, run] of attempts) {
      try {
        const results = (await run()).slice(0, count);
        const lines = results.map((r, i) => `${i + 1}. ${r.title}${r.date ? ` (${r.date})` : ""}\n   ${r.url}\n   ${r.snippet}`);
        const text = results.length
          ? `Results for "${query}" via ${name}:\n${lines.join("\n")}`
          : `No results for "${query}" via ${name}`;
        return { content: [{ type: "text" as const, text }], details: { provider: name, query, count, results } };
      } catch (error) {
        errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    throw new Error(`web_search failed — ${errors.join("; ")}`);
  },
});

export default function (pi: ExtensionAPI) {
  pi.registerTool(searchTool);
}
