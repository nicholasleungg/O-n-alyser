import type { Lang } from "./profiles";
import type { AnalysisResult, Complexity } from "./types";
import { analyse } from "./analyse";
import { buildNormalizedIr, type RecursionSignal, type TreeSitterNode } from "./ir";

type SupportedLang = Exclude<Lang, "auto">;

type TreeSitterLanguage = {
	query: (source: string) => TreeSitterQuery;
};

type TreeSitterQuery = {
	matches: (node: TreeSitterNode) => TreeSitterMatch[];
};

type TreeSitterMatch = {
	captures: Array<{ node: TreeSitterNode }>;
};

type ParserModule = {
	default: {
		init: () => Promise<void>;
		Language: {
			load: (path: string) => Promise<TreeSitterLanguage>;
		};
		new (): {
			setLanguage: (language: TreeSitterLanguage) => void;
			parse: (code: string) => { rootNode: TreeSitterNode };
		};
	};
};

const LANGUAGE_WASM_URLS: Record<SupportedLang, string> = {
	python: "https://cdn.jsdelivr.net/npm/tree-sitter-python@0.23.6/tree-sitter-python.wasm",
	java: "https://cdn.jsdelivr.net/npm/tree-sitter-java@0.23.5/tree-sitter-java.wasm",
	c: "https://cdn.jsdelivr.net/npm/tree-sitter-c@0.23.5/tree-sitter-c.wasm",
};

const dynamicImporter = new Function("u", "return import(/* @vite-ignore */ u)") as (u: string) => Promise<unknown>;
const parserModulePromise: Promise<ParserModule["default"]> = dynamicImporter("https://esm.sh/web-tree-sitter@0.25.10").then(mod => (mod as ParserModule).default);
const languageCache = new Map<SupportedLang, Promise<TreeSitterLanguage>>();

const BIG_O_RANK: Record<string, number> = {
	"O(?)": -1,
	"O(1)": 0,
	"O(log n)": 1,
	"O(n)": 2,
	"O(n log n)": 3,
	"O(n^2)": 4,
	"O(n^3)": 5,
	"O(2^n)": 6,
	"O(n!)": 7,
};

function rankBigO(bigO: string): number {
	return BIG_O_RANK[bigO] ?? -1;
}

function pickDominant(candidates: Complexity[]): Complexity {
	return candidates.reduce((best, cur) => (rankBigO(cur.bigO) > rankBigO(best.bigO) ? cur : best), candidates[0]);
}

function canonicalLoopComplexity(depth: number, hasLogLoop: boolean): string {
	if (depth <= 0) return "O(1)";
	if (depth >= 3) return "O(n^3)";
	if (depth === 2) return "O(n^2)";
	if (hasLogLoop) return "O(log n)";
	return "O(n)";
}

function recursionComplexity(recursion: RecursionSignal[]): string | null {
	if (recursion.some(r => r.complexityHint === "factorial")) return "O(n!)";
	if (recursion.some(r => r.complexityHint === "exponential")) return "O(2^n)";
	if (recursion.length > 0) return "O(n)";
	return null;
}

async function getLanguage(lang: SupportedLang): Promise<TreeSitterLanguage> {
	const cached = languageCache.get(lang);
	if (cached) return cached;

	const promise = (async () => {
		const Parser = await parserModulePromise;
		await Parser.init();
		return Parser.Language.load(LANGUAGE_WASM_URLS[lang]);
	})();

	languageCache.set(lang, promise);
	return promise;
}

export async function analyseWithTreeSitter(code: string, chosenLang: Lang = "auto"): Promise<AnalysisResult> {
	const lang: SupportedLang = chosenLang === "auto" ? "python" : chosenLang;

	try {
		const Parser = await parserModulePromise;
		const language = await getLanguage(lang);
		const parser = new Parser();
		parser.setLanguage(language);

		const tree = parser.parse(code ?? "");
		const ir = buildNormalizedIr(tree.rootNode, lang);
		const maxDepth = ir.loops.reduce((best, loop) => Math.max(best, loop.depth), 0);
		const hasLogLoop = ir.loops.some(loop => loop.boundHint === "log n");
		const hasSort = ir.sortingCalls.length > 0;
		const recursionBigO = recursionComplexity(ir.recursion);
		const loopBigO = canonicalLoopComplexity(maxDepth, hasLogLoop);

		const why: string[] = ["Used Tree-sitter CST parsing with language adapters and normalized IR extraction."];
		const tags: string[] = [];
		const timeCandidates: Complexity[] = [];

		if (ir.loops.length === 0 && !hasSort && !recursionBigO) {
			timeCandidates.push({ bigO: "O(1)", confidence: 0.35 });
			why.push("No loops, recursion, or sort operations detected in IR.");
		}

		if (ir.loops.length > 0) {
			timeCandidates.push({ bigO: loopBigO, confidence: 0.72 });
			why.push(`Detected ${ir.loops.length} loop(s) with max depth ${maxDepth}, mapped to ${loopBigO}.`);
		}

		if (hasSort) {
			tags.push("sort");
			timeCandidates.push({ bigO: "O(n log n)", confidence: 0.7 });
			why.push(`Detected ${ir.sortingCalls.length} sorting call(s), suggesting O(n log n).`);
		}

		if (hasSort && ir.loops.length > 0) {
			timeCandidates.push({ bigO: "O(n log n)", confidence: 0.76 });
			why.push("Sort + loop combination preserved as canonical O(n log n). (Worst-case composition may exceed this heuristic.)");
		}

		if (recursionBigO) {
			tags.push("recursion");
			timeCandidates.push({ bigO: recursionBigO, confidence: recursionBigO === "O(n)" ? 0.52 : 0.78 });
			why.push(`Detected recursion pattern mapped to canonical ${recursionBigO}.`);
		}

		if (ir.libraryOps.length > 0) {
			tags.push("library-ops");
			why.push(`Detected ${ir.libraryOps.length} library operation pattern(s): ${ir.libraryOps.slice(0, 2).join("; ")}.`);
		}

		if (timeCandidates.length === 0) {
			timeCandidates.push({ bigO: "O(1)", confidence: 0.25 });
			why.push("No strong CST/IR indicators detected.");
		}

		return {
			loops: { count: ir.loops.length, maxDepth },
			tags,
			time: pickDominant(timeCandidates),
			why,
		};
	} catch {
		const fallback = analyse(code, lang);
		return {
			...fallback,
			why: ["Tree-sitter unavailable; fell back to heuristic analysis.", ...fallback.why],
		};
	}
}
