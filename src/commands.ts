export type OutputAction =
  | { type: "text"; value: string }
  | { type: "undo" }
  | { type: "clear_all" };

const spokenPunctuation: Array<[RegExp, string]> = [
  [/\bnew paragraph\b/gi, "\n\n"],
  [/\bnew line\b/gi, "\n"],
  [/\bquestion mark\b/gi, "?"],
  [/\bexclamation (?:mark|point)\b/gi, "!"],
  [/\bopen parenthesis\b/gi, "("],
  [/\bclose parenthesis\b/gi, ")"],
  [/\bcomma\b/gi, ","],
  [/\bperiod\b/gi, "."]
];

function cleanSpacing(value: string): string {
  return value
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function interpretTranscript(transcript: string, enabled: boolean): OutputAction[] {
  const raw = transcript.trim();
  if (!raw) return [];
  if (!enabled) return [{ type: "text", value: raw }];

  if (/^(delete|undo) that[.!]?$/i.test(raw)) return [{ type: "undo" }];
  if (/^(clear all|clear everything|delete everything)[.!]?$/i.test(raw)) return [{ type: "clear_all" }];

  let value = raw;
  for (const [pattern, replacement] of spokenPunctuation) value = value.replace(pattern, replacement);
  return [{ type: "text", value: cleanSpacing(value) }];
}
