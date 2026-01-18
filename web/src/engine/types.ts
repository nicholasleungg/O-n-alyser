/**
 * loops.count: total loops detected in analysed code
 * loops.maxDepth: maximum nesting depth of loops
 * tags: describes recognised patterns (e.g "sort", "two-pointers")
 * time: estimated dominant time complexity
 * space: estimated additional space complexity
 * why: explains reasoning why the engine produced the result
 */


export type AnalysisResult = {
    loops: { count: number, maxDepth: number}
    tags: string[]
    time: Complexity;
    space: Complexity;
    why: string[]
}


export type Complexity = {
    bigO: string;
    confidence: number;
}