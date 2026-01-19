export type Lang = "auto" | "python" | "java" | "c";

export type LanguageProfile = {
    name: Exclude<Lang, "auto">;
    usesBraces: boolean,

    removeComments: (code: string) => string;

    loopRegexes: RegExp[];

    sortRegexes: RegExp[];
    
}

function removeCComments(code: string): string {
    return code
        .replace(/\/\*[\s\S]*?\*\//g, "") // remove /* ... */
        .replace(/\/\/.*$/gm, "")         // remove // ...
}

function removeJavaComments(code: string): string {
    return code
        .replace(/\/\*[\s\S]*?\*\//g, "") // remove /* ... */
        .replace(/\/\/.*$/gm, "")         // remove // ...
}

function removePythonComments(code: string): string {
    return code
        .replace(/"""[\s\S]*?"""/g, "") // remove triple double quote blocks """..."""
        .replace(/'''[\s\S]*?'''/g, "") // remove triple single quote blocks '''...'''
        .replace(/#.*$/gm, "");         // remove # line comments
}

export const PROFILES: Record<Exclude<Lang, "auto">, LanguageProfile> = {
    python: {
        name: "python",
        usesBraces: false,
        removeComments: removePythonComments,
        loopRegexes: [/\bfor\b/g, /\bwhile\b/g],
        sortRegexes: [/\bsorted\s*\(/i, /\.sort\s*\(/i],
    },

    java: {
        name: "java",
        usesBraces: true,
        removeComments: removeJavaComments,
        loopRegexes: [/\bfor\b/g, /\bwhile\b/g, /\bdo\b/g],
        sortRegexes: [/\bArrays\.sort\b/i, /\bCollections\.sort\b/i, /\.sort\s*\(/i],
    },

    c: {
        name: "c",
        usesBraces: true,
        removeComments: removeCComments,
        loopRegexes: [/\bfor\b/g, /\bwhile\b/g, /\bdo\b/g],
        sortRegexes: [/\bqsort\s*\(/i],
    }
}