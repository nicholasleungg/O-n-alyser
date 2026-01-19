import type { AnalysisResult } from "./types";

export function analyse(code: string): AnalysisResult {
    const text = (code === null || code === undefined) ? "" : code
    const lower = text.toLowerCase()

    // -----------------------
    // 1) LOOPS: count + depth
    // -----------------------

    const loopCount = ()
}