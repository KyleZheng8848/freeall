import type { ChatRequest } from "./types.js";

interface AnthropicContent {
  type?: string;
  text?: string;
}

interface AnthropicMessage {
  role: string;
  content: string | AnthropicContent[];
}

export interface AnthropicRequest {
  model?: string;
  provider?: string | string[];
  providers?: string | string[];
  messages?: AnthropicMessage[];
  system?: string | AnthropicContent[];
  max_tokens?: number;
  stream?: boolean;
  temperature?: number;
}

export function anthropicToOpenAI(body: AnthropicRequest): ChatRequest {
  const messages: ChatRequest["messages"] = [];
  const system = flattenContent(body.system);
  if (system) messages.push({ role: "system", content: system });
  for (const msg of body.messages ?? []) {
    messages.push({ role: msg.role, content: flattenContent(msg.content) });
  }
  return {
    model: body.model ?? "auto",
    provider: body.provider,
    providers: body.providers,
    messages,
    stream: Boolean(body.stream),
    max_tokens: body.max_tokens,
    temperature: body.temperature,
  };
}

export function openAIToAnthropic(json: unknown, model: string) {
  const content = extractText(json);
  const usage = (json as { usage?: { prompt_tokens?: number; completion_tokens?: number } } | undefined)?.usage;
  return {
    id: `msg_${Math.random().toString(36).slice(2)}`,
    type: "message",
    role: "assistant",
    model,
    content: [{ type: "text", text: content }],
    stop_reason: "end_turn",
    usage: {
      input_tokens: usage?.prompt_tokens ?? 0,
      output_tokens: usage?.completion_tokens ?? 0,
    },
  };
}

export function anthropicStreamFromText(model: string, text: string): string {
  const id = `msg_${Math.random().toString(36).slice(2)}`;
  const events = [
    {
      event: "message_start",
      data: {
        type: "message_start",
        message: {
          id,
          type: "message",
          role: "assistant",
          model,
          content: [],
          stop_reason: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      },
    },
    {
      event: "content_block_start",
      data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    },
    {
      event: "content_block_delta",
      data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
    },
    { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
    {
      event: "message_delta",
      data: { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } },
    },
    { event: "message_stop", data: { type: "message_stop" } },
  ];
  return events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join("");
}

export function anthropicPreamble(model: string): string {
  const id = `msg_${Math.random().toString(36).slice(2)}`;
  return [
    sse("message_start", {
      type: "message_start",
      message: {
        id,
        type: "message",
        role: "assistant",
        model,
        content: [],
        stop_reason: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    }),
    sse("content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    }),
  ].join("");
}

export function anthropicDelta(text: string): string {
  return sse("content_block_delta", {
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text },
  });
}

export function anthropicClose(): string {
  return [
    sse("content_block_stop", { type: "content_block_stop", index: 0 }),
    sse("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } }),
    sse("message_stop", { type: "message_stop" }),
  ].join("");
}

export function openAISseDelta(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const data = trimmed.slice(5).trim();
  if (!data || data === "[DONE]") return "";
  try {
    const json = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
    return json.choices?.[0]?.delta?.content ?? "";
  } catch {
    return null;
  }
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function extractText(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const choices = (json as { choices?: Array<{ message?: { content?: unknown } }> }).choices;
  const content = choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : (part as { text?: string }).text ?? ""))
      .join("");
  }
  return "";
}

function flattenContent(content: string | AnthropicContent[] | undefined): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content.map((part) => part.text ?? "").join("");
}
