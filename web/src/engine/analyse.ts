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
	return BIG_O_RANK[bigO];
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

		m = t.match(
		/\bfor\b.+\bin\b\s*range\s*\(\s*\d+\s*,\s*([A-Za-z_]\w*)\s*\)/
		);
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

function bigOFromFactors(factors: string[]): string {
	if (factors.length === 0) return "O(1)";
	if (factors.length === 1) return `O(${factors[0]})`;
	return `O(${factors.join("*")})`;
}

function classifyBound(bound: string): "constant" | "log n" | "n" {
	const clean = bound.trim();

	if (!clean) return "n";

	if (/^\d+$/.test(clean)) return "constant";

	if (/\blog\b|\bln\b/i.test(clean)) return "log n";

	if (/^[A-Za-z_]\w*$/.test(clean)) return "n";

	if (/^[A-Za-z_]\w*\s*[-+*/]\s*\d+$/.test(clean)) return "n";

	if (/^\d+\s*[-+*/]\s*[A-Za-z_]\w*$/.test(clean)) return "n";

	return "n";
}

function normalizeFactors(rawFactors: string[]): string[] {
	const counts = new Map<string, number>();

	for (const raw of rawFactors) {
		const kind = classifyBound(raw);
		if (kind === "constant") continue;
		counts.set(kind, (counts.get(kind) ?? 0) + 1);
	}

	const normalized: string[] = [];

	if ((counts.get("log n") ?? 0) > 0) {
		normalized.push("log n");
	}

	const nCount = counts.get("n") ?? 0;
	if (nCount === 1) normalized.push("n");
	if (nCount > 1) normalized.push(`n^${nCount}`);

	return normalized;
}

function detectLogLoop(line: string, lang: Exclude<Lang, "auto">): boolean {
	const t = line.trim();

	if (lang === "python") {
		return /\bwhile\b.+(?:\/\/=|\*=)\s*\d+/i.test(t);
	}

	if (!/\bfor\b|\bwhile\b/.test(t)) return false;

	return /(?:\*=|\/=|>>=|<<=)\s*\d+/.test(t);
}

export function analyse(code: string, chosen_lang: Lang = "auto"): AnalysisResult {
	const raw = code ?? "";

	const lang: Exclude<Lang, "auto"> =
		chosen_lang === "auto" ? "python" : chosen_lang;

	const profile = PROFILES[lang];
	const text = profile.removeComments(raw);

	// -----------------------
	// 1) LOOPS: count
	// -----------------------
	const loopCount = profile.loopRegexes.reduce(
		(sum, re) => sum + countMatches(text, re),
		0
	);

	// -----------------------
	// 2) LOOP DEPTH + BOUNDS PRODUCT (O(n*m))
	// -----------------------
	const lines = text.split("\n");

	type StackEntry = { level: number; bound: string };
	const stack: StackEntry[] = [];

	let maxDepth = 0;
	let maxProductFactors: string[] = [];
	let hasLogLoop = false;

	const recordProduct = () => {
		if (stack.length === 0) return;
		const factors = stack.map(s => s.bound);
		if (factors.length > maxProductFactors.length) {
		maxProductFactors = factors.slice();
		}
	};

	if (profile.usesBraces) {
		let braceDepth = 0;

		for (const line of lines) {
			const t = line.trim();
			if (!t) continue;

			const closes = t.match(/}/g)?.length ?? 0;
			braceDepth = Math.max(0, braceDepth - closes);

			while (stack.length && stack[stack.length - 1].level > braceDepth) {
				stack.pop();
			}

			const isLoop = profile.loopRegexes.some(re => safeTest(re, t));
			if (isLoop) {
				const bound = extractLoopBound(t, lang) ?? "n";
				stack.push({ level: braceDepth + 1, bound });
				hasLogLoop ||= detectLogLoop(t, lang);
				maxDepth = Math.max(maxDepth, stack.length);
				recordProduct();
			}

			const opens = t.match(/{/g)?.length ?? 0;
			braceDepth += opens;
		}
	} else {
		for (const line of lines) {
			const t = line.trim();
			if (!t) continue;

			const indent = line.match(/^\s*/)?.[0].length ?? 0;

			while (stack.length && stack[stack.length - 1].level >= indent) {
				stack.pop();
			}

			const isLoop = profile.loopRegexes.some(re => safeTest(re, t));
			if (isLoop) {
				const bound = extractLoopBound(t, lang) ?? "n";
				stack.push({ level: indent, bound });
				hasLogLoop ||= detectLogLoop(t, lang);
				maxDepth = Math.max(maxDepth, stack.length);
				recordProduct();
			}
		}
	}

	// -----------------------
	// 3) Tags
	// -----------------------
	const tags: string[] = [];
	const why: string[] = [];
	const normalizedFactors = normalizeFactors(maxProductFactors);

	const hasSort = profile.sortRegexes.some(re => safeTest(re, text));
	if (hasSort) {
		tags.push("sort");
		why.push(`Detected sorting in ${lang} (often O(n log n))`);
	}

	// -----------------------
	// 4) Time Guess
	// -----------------------
	const timeCandidates: Complexity[] = [];

	if (normalizedFactors.length === 1) {
		const bigO = bigOFromFactors(normalizedFactors);
		timeCandidates.push({ bigO, confidence: 0.6 });
		why.push(`Detected loop bounded by ${maxProductFactors[0]}, normalized to ${bigO}.`);
	}

	if (normalizedFactors.length >= 2) {
		const bigO = bigOFromFactors(normalizedFactors);
		timeCandidates.push({ bigO, confidence: 0.65 });
		why.push(
		`Detected nested loops with bounds ${maxProductFactors.join(" * ")}, normalized to ${bigO}.`
		);
	}

	if (maxDepth >= 2 && normalizedFactors.length < 2) {
		timeCandidates.push({ bigO: "O(n^2)", confidence: 0.45 });
		why.push("Nested loop depth >= 2 suggests quadratic behaviour.");
	}

	if (hasLogLoop) {
		timeCandidates.push({ bigO: "O(log n)", confidence: 0.58 });
		why.push("Detected multiplicative/divisive loop progression, suggesting logarithmic behaviour.");
	}

	if (hasSort) {
		timeCandidates.push({ bigO: "O(n log n)", confidence: 0.55 });
		why.push("Detected sorting (often O(n log n)).");
	}

	if (loopCount >= 1) {
		timeCandidates.push({ bigO: "O(n)", confidence: 0.45 });
		why.push("Detected loop(s); linear is a common dominant term.");
	}

	if (timeCandidates.length === 0) {
		timeCandidates.push({ bigO: "O(1)", confidence: 0.25 });
		why.push("No strong patterns detected (simple heuristics).");
	}

	const dominantTime = pickDominant(timeCandidates);

	return {
		loops: { count: loopCount, maxDepth },
		tags,
		time: dominantTime,
		why,
	};
}
