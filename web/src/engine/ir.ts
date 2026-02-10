import type { Lang } from "./profiles";

type SupportedLang = Exclude<Lang, "auto">;

export type TreeSitterNode = {
	type: string;
	text: string;
	childCount: number;
	child: (index: number) => TreeSitterNode;
};

export type RecursionSignal = {
	functionName: string;
	direct: boolean;
	selfCallCount: number;
	complexityHint: "linear" | "exponential" | "factorial";
};

export type NormalizedIr = {
	lang: SupportedLang;
	loops: Array<{ kind: "for" | "while" | "do"; depth: number; boundHint: "constant" | "log n" | "n" }>;
	recursion: RecursionSignal[];
	sortingCalls: string[];
	libraryOps: string[];
};

type LanguageAdapter = {
	loopNodes: Record<string, "for" | "while" | "do">;
	functionNodeTypes: string[];
	sortCallRegexes: RegExp[];
	libraryOpRegexes: RegExp[];
};

const ADAPTERS: Record<SupportedLang, LanguageAdapter> = {
	python: {
		loopNodes: { for_statement: "for", while_statement: "while" },
		functionNodeTypes: ["function_definition"],
		sortCallRegexes: [/\bsorted\s*\(/, /\.sort\s*\(/],
		libraryOpRegexes: [/\bset\s*\(/, /\bdict\s*\(/, /\bheapq\./, /\bbisect\./],
	},
	java: {
		loopNodes: {
			for_statement: "for",
			enhanced_for_statement: "for",
			while_statement: "while",
			do_statement: "do",
		},
		functionNodeTypes: ["method_declaration"],
		sortCallRegexes: [/\bArrays\.sort\s*\(/, /\bCollections\.sort\s*\(/, /\.sort\s*\(/],
		libraryOpRegexes: [/\bHashMap\b/, /\bHashSet\b/, /\bPriorityQueue\b/, /\bDeque\b/],
	},
	c: {
		loopNodes: { for_statement: "for", while_statement: "while", do_statement: "do" },
		functionNodeTypes: ["function_definition"],
		sortCallRegexes: [/\bqsort\s*\(/],
		libraryOpRegexes: [/\bbsearch\s*\(/, /\bmalloc\s*\(/, /\bcalloc\s*\(/, /\brealloc\s*\(/],
	},
};

function boundHintFromText(text: string): "constant" | "log n" | "n" {
	if (/(\*=|\/=|>>=|<<=|\/\/=)\s*\d+/.test(text)) return "log n";
	if (/\b(log|ln)\b/i.test(text)) return "log n";
	if (/\b\d+\b/.test(text) && !/[A-Za-z_]/.test(text)) return "constant";
	return "n";
}

function extractFunctionName(text: string, lang: SupportedLang): string {
	if (lang === "python") {
		const m = text.match(/\bdef\s+([A-Za-z_]\w*)\s*\(/);
		return m?.[1] ?? "";
	}
	if (lang === "java") {
		const m = text.match(/(?:public|private|protected|static|final|synchronized|native|abstract|\s)+\s*[\w<>\[\]]+\s+([A-Za-z_]\w*)\s*\(/);
		return m?.[1] ?? "";
	}
	const m = text.match(/[A-Za-z_]\w*\s+([A-Za-z_]\w*)\s*\(/);
	return m?.[1] ?? "";
}

function getRecursionSignal(functionText: string, functionName: string): RecursionSignal | null {
	if (!functionName) return null;
	const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const selfCallRe = new RegExp(`\\b${escaped}\\s*\\(`, "g");
	const calls = functionText.match(selfCallRe) ?? [];
	if (calls.length <= 1) return null;

	const branchCalls = Math.max(0, calls.length - 1);
	const factorialLike = /\b\w+\s*\*\s*\w*\s*\(?\s*\b\w+\s*-\s*1\s*\)?/m.test(functionText) ||
		/\breturn\b[\s\S]*\*\s*[A-Za-z_]\w*\s*\(/m.test(functionText);

	let complexityHint: RecursionSignal["complexityHint"] = "linear";
	if (factorialLike) complexityHint = "factorial";
	else if (branchCalls >= 2) complexityHint = "exponential";

	return {
		functionName,
		direct: true,
		selfCallCount: branchCalls,
		complexityHint,
	};
}

export function buildNormalizedIr(rootNode: TreeSitterNode, lang: SupportedLang): NormalizedIr {
	const adapter = ADAPTERS[lang];
	const loops: NormalizedIr["loops"] = [];
	const sortingCalls = new Set<string>();
	const libraryOps = new Set<string>();
	const recursion: NormalizedIr["recursion"] = [];

	const walk = (node: TreeSitterNode, depth: number): void => {
		const loopKind = adapter.loopNodes[node.type];
		const nextDepth = loopKind ? depth + 1 : depth;

		if (loopKind) {
			loops.push({ kind: loopKind, depth: nextDepth, boundHint: boundHintFromText(node.text) });
		}

		for (const re of adapter.sortCallRegexes) {
			if (re.test(node.text)) sortingCalls.add(node.text.trim().slice(0, 120));
		}

		for (const re of adapter.libraryOpRegexes) {
			if (re.test(node.text)) libraryOps.add(node.text.trim().slice(0, 120));
		}

		if (adapter.functionNodeTypes.includes(node.type)) {
			const functionName = extractFunctionName(node.text, lang);
			const signal = getRecursionSignal(node.text, functionName);
			if (signal) recursion.push(signal);
		}

		for (let i = 0; i < node.childCount; i += 1) {
			walk(node.child(i), nextDepth);
		}
	};

	walk(rootNode, 0);

	return {
		lang,
		loops,
		recursion,
		sortingCalls: [...sortingCalls],
		libraryOps: [...libraryOps],
	};
}
