import type { AnalysisResult, Complexity } from "./types";
import { PROFILES, type Lang } from "./profiles";

function countMatches(text: string, re: RegExp): number {
	return (text.match(re) ?? []).length;
}

function safeTest(re: RegExp, s: string): boolean {
	re.lastIndex = 0;
	return re.test(s);
}

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
	const known = candidates.filter(c => c.bigO !== "O(?)");
	const list = known.length ? known : candidates;

	return list.reduce((best, cur) => {
		return rankBigO(cur.bigO) > rankBigO(best.bigO) ? cur : best;
	}, list[0] ?? { bigO: "O(?)", confidence: 0.25 });
}

function extractLoopBound(line: string, lang: Exclude<Lang, "auto">): string | null {
	const t = line.trim();

	if (lang === "python") {
		let m = t.match(/\bfor\b.+?\bin\b\s*range\s*\(\s*([^,)]+)\s*/);
		if (m) return m[1];

		m = t.match(/\bwhile\b.+<\s*([A-Za-z_]\w*)/);
		if (m) return m[1];
		return null;
	}

	let m = t.match(/\bfor\b\s*\(.*?<\s*([A-Za-z_]\w*)\s*;/);
	if (m) return m[1];

	m = t.match(/\bwhile\b\s*\(.*?<\s*([A-Za-z_]\w*)/);
	if (m) return m[1];

	return null;
}

function classifyBound(bound: string): "constant" | "log n" | "n" {
	const clean = bound.trim();
	if (!clean) return "n";
	if (/^\d+$/.test(clean)) return "constant";
	if (/\blog\b|\bln\b/i.test(clean)) return "log n";
	return "n";
}

function detectLogLoop(line: string, lang: Exclude<Lang, "auto">): boolean {
	const t = line.trim();

	if (lang === "python") {
		return /\bwhile\b.+(?:\/\/=|\*=)\s*\d+/i.test(t);
	}

	if (!/\bfor\b|\bwhile\b/.test(t)) return false;
	return /(?:\*=|\/=|>>=|<<=)\s*\d+/.test(t);
}

function detectGlobalLogProgression(text: string, lang: Exclude<Lang, "auto">): boolean {
	if (lang === "python") {
		return /(?:\/\/=|\*=)\s*\d+/.test(text);
	}
	return /(?:\*=|\/=|>>=|<<=)\s*\d+/.test(text);
}

function detectRecursionComplexity(text: string): "O(n)" | "O(2^n)" | "O(n!)" | null {
	const functionRe = /\b(?:def|[A-Za-z_]\w*\s+)([A-Za-z_]\w*)\s*\([^)]*\)\s*[{:]?/g;
	const names = new Set<string>();
	let m: RegExpExecArray | null;
	while ((m = functionRe.exec(text))) {
		names.add(m[1]);
	}

	for (const name of names) {
		const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const calls = text.match(new RegExp(`\\b${escaped}\\s*\\(`, "g")) ?? [];
		if (calls.length <= 1) continue;

		if (/\breturn\b[\s\S]*\*\s*[A-Za-z_]\w*\s*\(/m.test(text)) return "O(n!)";
		if (calls.length >= 3) return "O(2^n)";
		return "O(n)";
	}

	return null;
}

function canonicalLoopComplexity(maxDepth: number, hasLogLoop: boolean, loopCount: number): "O(1)" | "O(log n)" | "O(n)" | "O(n^2)" | "O(n^3)" {
	if (loopCount === 0) return "O(1)";
	if (maxDepth >= 3) return "O(n^3)";
	if (maxDepth === 2) return "O(n^2)";
	if (hasLogLoop) return "O(log n)";
	return "O(n)";
}

export function analyse(code: string, chosenLang: Lang = "auto"): AnalysisResult {
	const raw = code ?? "";
	const lang: Exclude<Lang, "auto"> = chosenLang === "auto" ? "python" : chosenLang;
	const profile = PROFILES[lang];
	const text = profile.removeComments(raw);

	const loopCount = profile.loopRegexes.reduce((sum, re) => sum + countMatches(text, re), 0);
	const lines = text.split("\n");

	type StackEntry = { level: number; bound: string };
	const stack: StackEntry[] = [];
	let maxDepth = 0;
	
	let hasLogLoop = false;

	if (profile.usesBraces) {
		let braceDepth = 0;
		for (const line of lines) {
			const t = line.trim();
			if (!t) continue;

			const closes = t.match(/}/g)?.length ?? 0;
			braceDepth = Math.max(0, braceDepth - closes);
			while (stack.length && stack[stack.length - 1].level > braceDepth) stack.pop();

			const isLoop = profile.loopRegexes.some(re => safeTest(re, t));
			if (isLoop) {
				const bound = extractLoopBound(t, lang) ?? "n";
				stack.push({ level: braceDepth + 1, bound });
				hasLogLoop ||= detectLogLoop(t, lang) || classifyBound(bound) === "log n";
				maxDepth = Math.max(maxDepth, stack.length);
			}

			const opens = t.match(/{/g)?.length ?? 0;
			braceDepth += opens;
		}
	} else {
		for (const line of lines) {
			const t = line.trim();
			if (!t) continue;

			const indent = line.match(/^\s*/)?.[0].length ?? 0;

			while (stack.length && stack[stack.length - 1].level >= indent) stack.pop();

			const isLoop = profile.loopRegexes.some(re => safeTest(re, t));
			if (isLoop) {
				const bound = extractLoopBound(t, lang) ?? "n";
				stack.push({ level: indent, bound });
				hasLogLoop ||= detectLogLoop(t, lang) || classifyBound(bound) === "log n";
				maxDepth = Math.max(maxDepth, stack.length);
			}
		}
	}

	hasLogLoop ||= detectGlobalLogProgression(text, lang);

	const tags: string[] = [];
	const why: string[] = [];
	const timeCandidates: Complexity[] = [];

	const hasSort = profile.sortRegexes.some(re => safeTest(re, text));
	if (hasSort) {
		tags.push("sort");
		timeCandidates.push({ bigO: "O(n log n)", confidence: 0.65 });
		why.push("Detected sorting operation; normalized to canonical O(n log n).");
	}

	const recursionBigO = detectRecursionComplexity(text);
	if (recursionBigO) {
		tags.push("recursion");
		timeCandidates.push({ bigO: recursionBigO, confidence: recursionBigO === "O(n)" ? 0.52 : 0.76 });
		why.push(`Detected recursion pattern mapped to canonical ${recursionBigO}.`);
	}

	const loopBigO = canonicalLoopComplexity(maxDepth, hasLogLoop, loopCount);
	if (loopCount > 0) {
		timeCandidates.push({ bigO: loopBigO, confidence: 0.62 });
		why.push(`Detected ${loopCount} loop(s) with depth ${maxDepth}, mapped to canonical ${loopBigO}.`);
	} else {
		timeCandidates.push({ bigO: "O(1)", confidence: 0.3 });
		why.push("No loop structures detected.");
	}

	if (hasSort && loopCount > 0) {
		timeCandidates.push({ bigO: "O(n log n)", confidence: 0.7 });
		why.push("Sort + loop pattern retained as canonical O(n log n). (Worst-case composition may be higher.)");
	}

	return {
		loops: { count: loopCount, maxDepth },
		tags,
		time: pickDominant(timeCandidates),
		why,
	};
}