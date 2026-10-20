import type { ChatRequest } from "./types.js";

export function isQuotaProbe(request: ChatRequest): boolean {
  const max = typeof request.max_tokens === "number" ? request.max_tokens : undefined;
  if (max !== undefined && max > 1) return false;
  const text = flatten(request.messages).toLowerCase();
  if (max === 1 && (text.includes("quota") || text.includes("limit") || text.includes("ping") || text.length < 24)) {
    return true;
  }
  return text.includes("check quota") || text.includes("rate limit probe");
}

export function isCountTokensPath(url: string): boolean {
  return /\/(count_tokens|countTokens)\b/i.test(url);
}

export function mockChat(model: string) {
  return {
    id: "freeall-probe",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "ok" },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

export function mockAnthropicCount(model: string) {
  return { input_tokens: 8, output_tokens: 0, model };
}

function flatten(messages: ChatRequest["messages"]): string {
  return messages
    .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "")))
    .join(" ");
}
