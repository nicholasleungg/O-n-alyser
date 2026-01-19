import type { AnalysisResult, Complexity } from "./types";
import { PROFILES, type Lang } from "./profiles";

function countMatches(text: string, re: RegExp): number {
    return (text.match(re) ?? []).length;
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


export function analyse(code: string, chosen_lang: Lang = "auto"): AnalysisResult {
    const raw = code ?? "";

    const lang: Exclude<Lang, "auto"> =
        chosen_lang === "auto" ? "python" : chosen_lang

    const profile = PROFILES[lang]

    const text = profile.removeComments(raw);


    // -----------------------
    // 1) LOOPS: count + depth
    // -----------------------

    const loopCount = profile.loopRegexes.reduce(
        (sum, re) => sum + countMatches(text, re), 0
    );

    // -----------------------
    // 2) LOOP DEPTH
    // -----------------------

    let maxDepth = 0;

    if (profile.usesBraces) {
        let cur = 0;
        for (const line of text.split("\n")) {
            const t = line.trim()
            cur = Math.max(0, cur - ((t.match(/}/g)?.length ?? 0)));
            cur += t.match(/{/g)?.length ?? 0;
            maxDepth = Math.max(maxDepth, cur);
        }
    }
    else {
        const lines = text.split("\n").filter(l => l.trim().length > 0);
        const indents = lines.map(l => l.match(/^\s*/)?.[0].length ?? 0);
        const unique = new Set(indents);
        maxDepth = Math.max(0, unique.size - 1);
    }

    // -----------------------
    // 3) Tags
    // -----------------------

    const tags: string[] = [];
    const why: string[] = [];

    const hasSort = profile.sortRegexes.some(re => re.test(text))
    if (hasSort) {
        tags.push("sort");
        why.push('Detected sorting in ${lang} (often O(n log n))')
    }

    // -----------------------
    // 4) Time Guess
    // -----------------------
    
    const timeCandidates: Complexity[] = [];

    if (maxDepth >= 2) {
        timeCandidates.push({ bigO: "O(n^2)", confidence: 0.45 });
        why.push("Nested loop depth >= 2 suggests quadratic behaviour.");
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

    // choose dominating term
    const dominantTime = pickDominant(timeCandidates);

    return {
        loops: {count: loopCount, maxDepth},
        tags,
        time: dominantTime,
        why,
    }
}