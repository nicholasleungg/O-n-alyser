import './style.css'
import { analyse } from "./engine/analyse"
import type { Lang } from "./engine/profiles";
import type { AnalysisResult } from "./engine/types";

function render(input: string, chosen_lang: string, result: AnalysisResult): void {
  const output = document.getElementById("output") as HTMLDivElement;
  const outLang = document.getElementById("out_lang") as HTMLSpanElement;
  const outTime = document.getElementById("out_time") as HTMLSpanElement;
  const outConf = document.getElementById("out_conf") as HTMLSpanElement;
  const outText = document.getElementById("out_text") as HTMLPreElement;

  outLang.textContent = chosen_lang;
  outTime.textContent = result.time.bigO;
  outConf.textContent = `${Math.round(result.time.confidence * 100)}%`;
  outText.textContent = input;

  output.hidden = false;
}

function enteredPressed(): void {
  const inputEl = document.getElementById("input") as HTMLInputElement;
  const langEl = document.getElementById("chosen_lang") as HTMLSelectElement;

  const input = inputEl.value.trim();
  const chosen_lang = langEl.value as Lang;

  if (!input) {
    return;
  }

  if (!chosen_lang) {
    return;
  }

  const result = analyse(input, chosen_lang);
  render(input, chosen_lang, result);
}

const entered = document.getElementById("entered") as HTMLButtonElement;
entered.addEventListener("click", enteredPressed);