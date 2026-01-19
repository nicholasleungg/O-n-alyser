export type Lang = "auto" | "python" | "java" | "c";

export type LanguageProfile = {
    name: Exclude<Lang, "auto">;
    usesBraces: boolean,

    removeComments: (code: string) => string;

    loopRegexes: RegExp[];

    sortRegexes: RegExp[];
    
}

function stripCComments(code: string): string {
    return code
        .replace(/\/\*[\s\S]*?\*\//g, "") // remove /* ... */
        .replace(/\/\/.*$/gm, "")         // remove // ...
}

function stripJavaComments(code: string): string {
    return code
        .replace(/\/\*[\s\S]*?\*\//g, "") // remove /* ... */
        .replace(/\/\/.*$/gm, "")         // remove // ...
}

function stripPythonComments(code: string): string {
    return code
        .replace(/"""[\s\S]*?"""/g, "") // remove triple double quote blocks """..."""
        .replace(/'''[\s\S]*?'''/g, "") // remove triple single quote blocks '''...'''
        .replace(/#.*$/gm, "");         // remove # line comments
}