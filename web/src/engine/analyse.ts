import type { AnalysisResult } from "./types";
import { PROFILES, type Lang } from "./profiles";

function countMatches(text: string, re: RegExp): number {
    return (text.match(re) ?? []).length;
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
    
    let timeBigO = []
    let timeConf = 0.25

    if (maxDepth >= 2) {
        timeBigO = "O(n^2)"
        timeConf = 0.5
        why.push("Nested blocks suggest quadratic behaviour.")
    }
    
    else if (hasSort && loopCount == 0) {
        timeBigO = "O(n log n)"
        timeConf = 0.55;
    }
    else if (loopCount >= 1) {
        
    }
}