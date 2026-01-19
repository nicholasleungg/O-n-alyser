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
    const lower = text.toLowerCase();


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


}