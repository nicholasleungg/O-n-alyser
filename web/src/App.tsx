import { useState } from "react";
import "./style.css";

import { analyseWithTreeSitter } from "./engine/treeSitter";
import type { AnalysisResult } from "./engine/types";
import type { Lang } from "./engine/profiles";

export default function App() {

  const [input, setInput] = useState("");
  const [chosenLang, setChosenLang] = useState<Lang>("auto");

  const [result, setResult] = useState<AnalysisResult | null>(null);

  async function enteredPressed() {

    const trimmed = input.trim();

    if (!trimmed) return;
    if (chosenLang === "auto") return;

    const res = await analyseWithTreeSitter(trimmed, chosenLang);
    setResult(res);
  }

  return (
    <div className="container">

      <div className="row">

        <textarea
          id="input"
          placeholder="Copy and paste your code here"
          rows={8}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />

        <select
          id="chosen_lang"
          className="language-select"
          value={chosenLang}
          onChange={(e) => setChosenLang(e.target.value as Lang)}
        >
          <option value="auto" disabled>
            Select Language
          </option>
          <option value="java">Java</option>
          <option value="python">Python</option>
          <option value="c">C</option>
        </select>

      </div>

      <div className="but">
        <button id="entered" type="button" onClick={enteredPressed}>
          Calculate time complexity
        </button>
      </div>

      {result && (
        <div className="output" id="output">

          <p>
            <strong>Language:</strong>
            <span id="out_lang"> {chosenLang}</span>
          </p>

          <p>
            <strong>Time complexity:</strong>
            <span id="out_time"> {result.time.bigO}</span>
          </p>

          <p>
            <strong>Confidence:</strong>
            <span id="out_conf">
              {" "}{Math.round(result.time.confidence * 100)}%
            </span>
          </p>

          <p><strong>Input text:</strong></p>

          <pre id="out_text">
            {input}
          </pre>

        </div>
      )}

    </div>
  );
}
