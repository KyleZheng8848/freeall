export type AccountStatus = "healthy" | "unknown" | "cooldown" | "invalid" | "error";

export type ProviderId =
  | "groq"
  | "gemini"
  | "openrouter"
  | "cerebras"
  | "mistral"
  | "nvidia"
  | "together"
  | "siliconflow"
  | "zhipu"
  | "custom";

export interface EncBlob {
  iv: string;
  tag: string;
  ct: string;
}

export interface Account {
  id: string;
  name: string;
  provider: ProviderId;
  key: EncBlob;
  baseUrl?: string;
  enabled: boolean;
  status: AccountStatus;
  lastError?: string;
  lastUsedAt?: number;
  createdAt: number;
  verifiedAt?: number;
  note?: string;
  models?: string[];
  preferredModel?: string;
  /**
   * 选号优先级。越大越先用；同级随机。缺省 / 未设 = 0。
   * 范围建议 -99..99。
   */
  priority?: number;
  /** 缺省当免费档。关掉以后默认走法可以跳过这把。 */
  free?: boolean;
  /** 覆盖目录限额。只改本机估法，不读官网钱包。缺项仍用目录。null = 这项不限。 */
  limitOverride?: LimitOverride;
}

export interface LimitOverride {
  rpm?: number | null;
  rpd?: number | null;
  tpm?: number | null;
  tpd?: number | null;
}

export interface UsageEvent {
  accountId: string;
  kind: "request" | "tokens";
  tokens: number;
  at: number;
}

export type LogSource = "ask" | "cli" | "openai" | "anthropic" | "stream";

/** 一次实际上游调用。看板和日志页都读这份，不另记一套。 */
export interface GenerationLog {
  id: string;
  at: number;
  accountId: string;
  provider: ProviderId;
  accountName: string;
  model: string;
  ok: boolean;
  status?: number;
  ms: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  finishReason?: string;
  source: LogSource;
  error?: string;
  hops: number;
}

export interface Cooldown {
  accountId: string;
  until: number;
  reason: string;
}

export interface RoutePolicy {
  providers: ProviderId[];
  model: string;
  freeOnly?: boolean;
  /** provider/name 或账号 id。有则只走这一把。 */
  account?: string;
  /** auto 不走这些裸名。再扫到也不自动加回，指定模型仍可手动选。 */
  excludeModels?: string[];
}

/** 每个供应商的免费模型表。manual 刷新不丢；excluded 自动拉到也不回潮。 */
export interface ProviderFreeModels {
  /** 生效探测/合并列表（不含 excluded） */
  models: string[];
  /** 用户钉死的，优先级最高 */
  manual: string[];
  /** 用户剔除的 */
  excluded: string[];
  updatedAt?: number;
  source?: "probe" | "manual" | "mixed";
}

export interface Settings {
  port: number;
  host: string;
  gatewayToken: string;
  defaultModel: string;
  policy: RoutePolicy;
  /** 供应商 → 免费模型表 */
  providerFreeModels?: Record<string, ProviderFreeModels>;
  /** 用户点「稍后」关掉横幅的版本；同版本不再显示横幅。 */
  updateBannerDismissedVersion?: string;
  /** 已弹过系统通知的版本；同版本不再重复通知。 */
  updateNoticeSeenVersion?: string;
}

export interface StoreData {
  version: 1;
  accounts: Account[];
  usage: UsageEvent[];
  logs: GenerationLog[];
  cooldowns: Cooldown[];
  settings: Settings;
}

export interface ProviderSpec {
  id: ProviderId;
  label: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
  keyHint: string;
  signup: string;
  limits: {
    rpm: number | null;
    rpd: number | null;
    tpm: number | null;
    tpd: number | null;
    monthlyHint: string;
  };
}

export interface RouteAttempt {
  accountId: string;
  provider: ProviderId;
  name: string;
  model: string;
  ok: boolean;
  status?: number;
  ms: number;
  error?: string;
}

export interface ChatMessage {
  role: string;
  content: unknown;
}

export interface ChatRequest {
  model?: string;
  provider?: string | string[];
  providers?: string | string[];
  account?: string;
  messages: ChatMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  [key: string]: unknown;
}
