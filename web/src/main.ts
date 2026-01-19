import './style.css'
import { analyse } from "./engine/analyse"
import type { Lang } from "./engine/profiles";

function render(input: string, chosen_lang: string): void {
  console.log("Input text:", input);
  console.log("Chosen language:", chosen_lang);

  const output = document.getElementById("output") as HTMLDivElement;
  const outLang = document.getElementById("out_lang") as HTMLSpanElement;
  const outText = document.getElementById("out_text") as HTMLPreElement;

  outLang.textContent = chosen_lang;
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

  analyse(input, chosen_lang);

  render(input, chosen_lang);
}

const entered = document.getElementById("entered") as HTMLButtonElement;
entered.addEventListener("click", enteredPressed);