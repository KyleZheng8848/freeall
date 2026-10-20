import { tr } from "./i18n.js";
export type RecipeKind = "freeall" | "curl" | "openai" | "anthropic" | "claude" | "codex" | "opencode";

export interface RecipeGateway {
  url: string;
  openaiBase: string;
  token: string;
  model: string;
  /** 试一下 / 路由覆盖：指定供应商 */
  provider?: string;
  /** 试一下 / 路由覆盖：固定账号 ref 或 id */
  account?: string;
}

export function opencodeConfigContent(g: RecipeGateway, extraModels: string[] = []): string {
  const model = g.model || "auto";
  const models: Record<string, { name: string }> = {
    [model]: { name: model === "auto" ? "FreeAll auto" : model },
  };
  for (const id of extraModels) {
    if (id) models[id] = { name: id };
  }
  return JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    model: `freeall/${model}`,
    provider: {
      freeall: {
        npm: "@ai-sdk/openai-compatible",
        name: "FreeAll",
        options: {
          baseURL: g.openaiBase,
          apiKey: "{env:OPENAI_API_KEY}",
        },
        models,
      },
    },
  });
}

export function useCommand(kind: RecipeKind, g?: Pick<RecipeGateway, "model" | "provider" | "account">): string | null {
  if (kind === "curl" || kind === "openai" || kind === "anthropic") return null;
  if (kind === "freeall") {
    const parts = ["freeall ask"];
    if (g?.provider && g.provider !== "auto") parts.push(`--provider ${g.provider}`);
    if (g?.account) parts.push(`--account ${g.account}`);
    if (g?.model && g.model !== "auto") parts.push(`--model ${g.model}`);
    parts.push(tr("你好"));
    return parts.join(" ");
  }
  return `freeall use ${kind}`;
}

export function recipeHint(kind: RecipeKind): string | null {
  if (kind === "openai" || kind === "curl") {
    return tr("OpenAI Chat Completions 兼容模式。Bearer 填本机网关令牌；任意 OpenAI SDK / LiteLLM / LangChain 把 BASE_URL 指过来即可。");
  }
  if (kind === "anthropic") {
    return tr("Anthropic Messages API。x-api-key 或 Bearer 均可；走本机账号池，不扣 Anthropic 订阅。");
  }
  return null;
}

function routeHeaders(g: RecipeGateway, indent = "  "): string[] {
  const lines: string[] = [];
  if (g.provider && g.provider !== "auto") {
    lines.push(`${indent}-H 'X-FreeAll-Provider: ${g.provider}' \\`);
  }
  if (g.account) {
    lines.push(`${indent}-H 'X-FreeAll-Account: ${g.account}' \\`);
  }
  return lines;
}

function askBody(g: RecipeGateway): string {
  const parts = [tr("\"prompt\":\"你好\""), `"model":"${g.model || "auto"}"`];
  if (g.provider && g.provider !== "auto") parts.push(`"provider":"${g.provider}"`);
  if (g.account) parts.push(`"account":"${g.account}"`);
  return `{${parts.join(",")}}`;
}

function chatBody(g: RecipeGateway): string {
  const parts = [`"model":"${g.model || "auto"}"`, `"messages":[{"role":"user","content":"hi"}]`];
  if (g.provider && g.provider !== "auto") parts.push(`"provider":"${g.provider}"`);
  if (g.account) parts.push(`"account":"${g.account}"`);
  return `{${parts.join(",")}}`;
}

function messagesBody(g: RecipeGateway): string {
  const parts = [
    `"model":"${g.model || "auto"}"`,
    `"max_tokens":256`,
    `"messages":[{"role":"user","content":"hi"}]`,
  ];
  if (g.provider && g.provider !== "auto") parts.push(`"provider":"${g.provider}"`);
  if (g.account) parts.push(`"account":"${g.account}"`);
  return `{${parts.join(",")}}`;
}

export function recipeBody(kind: RecipeKind, g: RecipeGateway): string {
  const model = g.model || "auto";
  if (kind === "freeall") {
    return [
      `curl ${g.url}/v1/ask \\`,
      `  -H 'Authorization: Bearer ${g.token}' \\`,
      ...routeHeaders(g),
      `  -H 'Content-Type: application/json' \\`,
      `  -d '${askBody(g)}'`,
    ].join("\n");
  }
  if (kind === "claude") {
    const lines = [
      `export ANTHROPIC_BASE_URL=${g.url}`,
      `export ANTHROPIC_AUTH_TOKEN=${g.token}`,
    ];
    if (g.provider && g.provider !== "auto") lines.push(`export FREEALL_PROVIDER=${g.provider}`);
    if (g.account) lines.push(`export FREEALL_ACCOUNT=${g.account}`);
    if (model && model !== "auto") lines.push(tr("# 默认模型可用请求体 / 环境覆盖；当前试一下选的是 {0}", model));
    lines.push("claude");
    return lines.join("\n");
  }
  if (kind === "codex") {
    return [
      `export OPENAI_BASE_URL=${g.openaiBase}`,
      `export OPENAI_API_KEY=${g.token}`,
      ...(g.provider && g.provider !== "auto" ? [`export FREEALL_PROVIDER=${g.provider}`] : []),
      ...(g.account ? [`export FREEALL_ACCOUNT=${g.account}`] : []),
      `codex -c 'model_provider="freeall"' \\`,
      `  -c 'model_providers.freeall.base_url="${g.openaiBase}"' \\`,
      `  -c 'model_providers.freeall.env_key="OPENAI_API_KEY"' \\`,
      `  -c 'model_providers.freeall.wire_api="chat"' \\`,
      `  -c 'model="${model}"'`,
    ].join("\n");
  }
  if (kind === "opencode") {
    return [
      `export OPENAI_API_KEY=${g.token}`,
      `export OPENAI_BASE_URL=${g.openaiBase}`,
      ...(g.provider && g.provider !== "auto" ? [`export FREEALL_PROVIDER=${g.provider}`] : []),
      ...(g.account ? [`export FREEALL_ACCOUNT=${g.account}`] : []),
      `export OPENCODE_CONFIG_CONTENT='${opencodeConfigContent(g)}'`,
      `opencode -m freeall/${model}`,
    ].join("\n");
  }
  if (kind === "anthropic") {
    return [
      `# Anthropic Messages API`,
      `curl ${g.url}/v1/messages \\`,
      `  -H 'x-api-key: ${g.token}' \\`,
      `  -H 'anthropic-version: 2023-06-01' \\`,
      ...routeHeaders(g),
      `  -H 'Content-Type: application/json' \\`,
      `  -d '${messagesBody(g)}'`,
      ``,
      `# Claude / Anthropic SDK`,
      `export ANTHROPIC_BASE_URL=${g.url}`,
      `export ANTHROPIC_API_KEY=${g.token}`,
      tr("# 也可用：export ANTHROPIC_AUTH_TOKEN={0}", g.token),
    ].join("\n");
  }
  return [
    `# OpenAI Chat Completions`,
    `curl ${g.openaiBase}/chat/completions \\`,
    `  -H 'Authorization: Bearer ${g.token}' \\`,
    ...routeHeaders(g),
    `  -H 'Content-Type: application/json' \\`,
    `  -d '${chatBody(g)}'`,
    ``,
    tr("# 任意 OpenAI SDK"),
    `export OPENAI_BASE_URL=${g.openaiBase}`,
    `export OPENAI_API_KEY=${g.token}`,
  ].join("\n");
}
