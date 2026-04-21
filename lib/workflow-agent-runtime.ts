import * as fs from "node:fs";
import * as https from "node:https";
import * as path from "node:path";
import * as tls from "node:tls";
import {
  getDefaultWorkflowModel,
  isExperimentalWorkflowModel,
  type WorkflowGenerationModel,
  type WorkflowProvider,
} from "@/lib/workflow-generation";

// Load optional CA certificate chain if present so node:https can verify TLS
// connections behind enterprise proxies or private gateways.
function loadCorporateCa(): Buffer | undefined {
  try {
    const configuredPath = process.env.WORKFLOW_CA_CERT_PATH?.trim();
    if (!configuredPath) {
      return undefined;
    }
    const certPath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(process.cwd(), configuredPath);

    return fs.existsSync(certPath) ? fs.readFileSync(certPath) : undefined;
  } catch {
    return undefined;
  }
}

const CORPORATE_CA = loadCorporateCa();
const TRUSTED_CA_BUNDLE = CORPORATE_CA
  ? [...tls.rootCertificates, CORPORATE_CA.toString("utf8")]
  : undefined;
const CONFIGURED_CA_CERT_PATH = process.env.WORKFLOW_CA_CERT_PATH?.trim() || "";
const ALLOW_INSECURE_PROVIDER_TLS =
  process.env.WORKFLOW_ALLOW_INSECURE_TLS === "true";
const ALLOW_INSECURE_CLAUDE_TLS =
  process.env.WORKFLOW_ALLOW_INSECURE_CLAUDE_TLS === "true";
const FORCE_HTTPS_HOSTS = new Set(
  (process.env.WORKFLOW_FORCE_HTTPS_HOSTS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);
const INSECURE_TLS_HOSTS = new Set(
  (process.env.WORKFLOW_INSECURE_TLS_HOSTS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);
const INSECURE_TLS_PROVIDERS = new Set(
  (process.env.WORKFLOW_INSECURE_TLS_PROVIDERS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);
const LOGGED_TRANSPORT_PATHS = new Set<string>();

console.info("[workflow-runtime] TLS config", {
  caPath: CONFIGURED_CA_CERT_PATH || null,
  insecureProviderTls: ALLOW_INSECURE_PROVIDER_TLS,
  insecureClaudeTls: ALLOW_INSECURE_CLAUDE_TLS,
  forceHttpsHosts: [...FORCE_HTTPS_HOSTS],
  insecureTlsHosts: [...INSECURE_TLS_HOSTS],
  insecureTlsProviders: [...INSECURE_TLS_PROVIDERS],
});

function getHostname(url: string): string {
  return new URL(url).hostname.toLowerCase();
}

function shouldAllowInsecureTls(
  url: string,
  provider?: WorkflowProvider
): boolean {
  const hostname = getHostname(url);

  return (
    ALLOW_INSECURE_PROVIDER_TLS ||
    (provider === "claude" && ALLOW_INSECURE_CLAUDE_TLS) ||
    INSECURE_TLS_HOSTS.has(hostname) ||
    (provider ? INSECURE_TLS_PROVIDERS.has(provider) : false)
  );
}

function shouldUseCustomTls(url: string, provider?: WorkflowProvider): boolean {
  if (!url.startsWith("https://")) {
    return false;
  }

  const hostname = getHostname(url);

  return (
    Boolean(CORPORATE_CA) ||
    FORCE_HTTPS_HOSTS.has(hostname) ||
<<<<<<< HEAD
    hostname === "localhost"
=======
    shouldAllowInsecureTls(url, provider) ||
    hostname === "localhost" ||
    hostname.endsWith(".mphasis.ai") ||
    hostname.endsWith(".gcp.mphasis.ai")
>>>>>>> 0e5407c (refactor: enhance TLS handling for custom providers and improve request routing)
  );
}

function isTlsCertificateError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? `${error.message} ${
          (error as Error & { cause?: unknown }).cause instanceof Error
            ? (error as Error & { cause?: Error }).cause?.message || ""
            : ""
        }`
      : "";

  return /self-signed certificate|certificate chain|unable to verify/i.test(
    message
  );
}

<<<<<<< HEAD
function logTransportPathOnce(
  mode: "fetch" | "corporate-tls",
  url: string,
  provider?: WorkflowProvider
) {
  const logKey = [
    mode,
    provider || "unknown",
    getHostname(url),
    CONFIGURED_CA_CERT_PATH || "no-ca",
    shouldAllowInsecureTls(url, provider) ? "insecure" : "secure",
  ].join("|");

  if (LOGGED_TRANSPORT_PATHS.has(logKey)) {
    return;
  }

  LOGGED_TRANSPORT_PATHS.add(logKey);

  console.info(
    `[workflow-runtime] using ${
      mode === "corporate-tls" ? "corporate TLS path" : "fetch path"
    }`,
    {
      provider,
      host: getHostname(url),
      caPath: CONFIGURED_CA_CERT_PATH || null,
      insecureTls: shouldAllowInsecureTls(url, provider),
    }
  );
}

// When a corporate CA is present, make a TLS-verified request using node:https
// instead of the global fetch (which Next.js may patch and which ignores
// NODE_EXTRA_CA_CERTS in some configurations).
=======
// Make a TLS-aware request using node:https when we need a custom CA bundle or
// host/provider-specific TLS overrides that the global fetch path may ignore.
>>>>>>> 0e5407c (refactor: enhance TLS handling for custom providers and improve request routing)
async function httpsRequestToResponse(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  provider?: WorkflowProvider
): Promise<Response> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("AbortError"));
      return;
    }

    signal.addEventListener("abort", () => reject(new Error("AbortError")), {
      once: true,
    });

    const parsed = new URL(url);

    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: (init.method ?? "GET").toUpperCase(),
        headers: init.headers as Record<string, string>,
        ca: TRUSTED_CA_BUNDLE,
        rejectUnauthorized: !shouldAllowInsecureTls(url, provider),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          const headers: Record<string, string> = {};

          for (const [key, value] of Object.entries(res.headers)) {
            if (typeof value === "string") headers[key] = value;
            else if (Array.isArray(value)) headers[key] = value.join(", ");
          }

          resolve(new Response(body, { status: res.statusCode ?? 200, headers }));
        });
        res.on("error", reject);
      }
    );

    req.on("error", reject);

    if (init.body && typeof init.body === "string") {
      req.write(init.body);
    }

    req.end();
  });
}

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const _anthropicBaseUrl = process.env.ANTHROPIC_BASE_URL?.replace(/\/$/, "");
const CLAUDE_API_URL =
  process.env.CLAUDE_API_URL ||
  (_anthropicBaseUrl
    ? `${_anthropicBaseUrl}/v1/messages`
    : "https://api.anthropic.com/v1/messages");
const OLLAMA_API_URL =
  process.env.OLLAMA_API_URL || "http://localhost:11434/api/chat";
const PROVIDER_TIMEOUT_MS = 30000;
const GROQ_RATE_LIMIT_MAX_RETRIES = 2;
const GROQ_RATE_LIMIT_MAX_WAIT_MS = 8000;
const STRUCTURED_REQUEST_MAX_RETRIES = 2;
const STRUCTURED_REQUEST_RETRY_BASE_DELAY_MS = 1200;

export const MISSING_API_KEY_MESSAGES: Record<
  Exclude<WorkflowProvider, "ollama">,
  string
> = {
  groq:
    "Missing Groq API key. Add GROQ_API_KEY to .env.local or set it from chatbot settings.",
  openai:
    "Missing OpenAI API key. Add OPENAI_API_KEY to .env.local or set it from chatbot settings.",
  claude:
    "Missing Claude API key. Add ANTHROPIC_API_KEY to .env.local or set it from chatbot settings.",
};

export function supportsStrictStructuredOutputs(model: string) {
  return (
    model === "openai/gpt-oss-20b" ||
    model === "openai/gpt-oss-120b" ||
    model.startsWith("gpt-")
  );
}

// Strip characters that are invalid in HTTP header values.
// Valid range: HTAB (0x09), SP (0x20), and visible ASCII (0x21-0x7E).
// This removes control chars, DEL, and any non-ASCII Unicode (e.g. em dashes
// that autocorrect may silently substitute for hyphens in API keys).
function sanitizeHeaderValue(value: string): string {
  return value.trim().replace(/[^\x09\x20-\x7E]/g, "");
}

export function resolveApiKey(
  provider: WorkflowProvider,
  inlineApiKey?: string
): string {
  const requestApiKey = sanitizeHeaderValue(inlineApiKey ?? "");

  if (requestApiKey) {
    return requestApiKey;
  }

  if (provider === "groq") {
    return sanitizeHeaderValue(process.env.GROQ_API_KEY || "");
  }

  if (provider === "openai") {
    return sanitizeHeaderValue(process.env.OPENAI_API_KEY || "");
  }

  if (provider === "claude") {
    return sanitizeHeaderValue(
      process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || ""
    );
  }

  return "";
}

export function validateApiKeyForProvider(
  provider: WorkflowProvider,
  apiKey: string
): string | null {
  if (!apiKey) return null;

  if (provider === "groq" && !apiKey.startsWith("gsk_")) {
    return "Selected provider is Groq, but the key format does not look like a Groq key (expected prefix: gsk_).";
  }

  if (provider === "openai" && !apiKey.startsWith("sk-")) {
    return "Selected provider is OpenAI, but the key format does not look like an OpenAI key (expected prefix: sk-).";
  }

  if (
    provider === "claude" &&
    !apiKey.startsWith("sk-ant-") &&
    !apiKey.startsWith("sk-")
  ) {
    return 'Selected provider is Claude, but the key format does not look like an Anthropic key (expected prefix like "sk-").';
  }

  return null;
}

export function getEffectiveWorkflowModel(
  provider: WorkflowProvider,
  model: WorkflowGenerationModel
): WorkflowGenerationModel {
  if (provider === "groq" && isExperimentalWorkflowModel(model)) {
    return "openai/gpt-oss-120b";
  }

  return model || getDefaultWorkflowModel(provider);
}

export function createRequestId() {
  return crypto.randomUUID();
}

export function parseJsonObjectFromText<T>(
  outputText: string,
  label: string
): T {
  const trimmed = outputText.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidateText = fencedMatch?.[1]?.trim() || trimmed;

  try {
    return JSON.parse(candidateText) as T;
  } catch {
    const firstBrace = candidateText.indexOf("{");

    if (firstBrace === -1) {
      throw new Error(`${label} did not contain a JSON object.`);
    }

    for (
      let lastBrace = candidateText.lastIndexOf("}");
      lastBrace > firstBrace;
      lastBrace = candidateText.lastIndexOf("}", lastBrace - 1)
    ) {
      const jsonSlice = candidateText.slice(firstBrace, lastBrace + 1);

      try {
        return JSON.parse(jsonSlice) as T;
      } catch {
        continue;
      }
    }

    throw new Error(`${label} did not contain a valid JSON object.`);
  }
}

type ExtractedModelResponse = {
  content: string;
  reasoning?: string;
  warnings?: string[];
};

function collectTextParts(
  value: unknown,
  selector: (part: Record<string, unknown>) => string | null
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (part): part is Record<string, unknown> =>
        typeof part === "object" && part !== null
    )
    .map(selector)
    .filter((part): part is string => Boolean(part?.trim()))
    .map((part) => part.trim());
}

function extractWarnings(response: unknown) {
  if (
    response &&
    typeof response === "object" &&
    "warnings" in response &&
    Array.isArray(response.warnings)
  ) {
    return response.warnings
      .filter((warning): warning is string => typeof warning === "string")
      .map((warning) => warning.trim())
      .filter(Boolean);
  }

  return [];
}

function extractOpenAIStyleContent(
  response: unknown
): ExtractedModelResponse {
  if (
    response &&
    typeof response === "object" &&
    "choices" in response &&
    Array.isArray(response.choices)
  ) {
    const [choice] = response.choices;

    if (
      choice &&
      typeof choice === "object" &&
      "message" in choice &&
      choice.message &&
      typeof choice.message === "object"
    ) {
      const message = choice.message as Record<string, unknown>;
      const directReasoning = [
        message.reasoning,
        message.reasoning_content,
      ]
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
        .join("\n\n");
      const warnings = extractWarnings(response);

      if (!("content" in message)) {
        throw new Error("Provider response did not include message content.");
      }

      const content = message.content;

      if (typeof content === "string") {
        return {
          content,
          reasoning: directReasoning || undefined,
          warnings: warnings.length > 0 ? warnings : undefined,
        };
      }

      if (Array.isArray(content)) {
        const textParts = collectTextParts(content, (part) =>
          part.type === "text" && typeof part.text === "string"
            ? part.text
            : null
        );
        const reasoningParts = collectTextParts(content, (part) => {
          if (
            (part.type === "reasoning" ||
              part.type === "reasoning_text" ||
              part.type === "thinking") &&
            typeof part.text === "string"
          ) {
            return part.text;
          }

          if (part.type === "thinking" && typeof part.thinking === "string") {
            return part.thinking;
          }

          return null;
        });

        if (textParts.length > 0) {
          return {
            content: textParts.join("\n"),
            reasoning:
              [directReasoning, reasoningParts.join("\n")]
                .filter(Boolean)
                .join("\n\n") || undefined,
            warnings: warnings.length > 0 ? warnings : undefined,
          };
        }
      }
    }
  }

  throw new Error("Provider response did not include message content.");
}

function extractClaudeContent(response: unknown): ExtractedModelResponse {
  if (
    response &&
    typeof response === "object" &&
    "content" in response &&
    Array.isArray(response.content)
  ) {
    const textBlocks = collectTextParts(response.content, (block) =>
      block.type === "text" && typeof block.text === "string"
        ? block.text
        : null
    );
    const reasoningBlocks = collectTextParts(response.content, (block) => {
      if (block.type === "thinking" && typeof block.thinking === "string") {
        return block.thinking;
      }

      if (block.type === "thinking" && typeof block.text === "string") {
        return block.text;
      }

      return null;
    });

    if (textBlocks.length > 0) {
      return {
        content: textBlocks.join("\n"),
        reasoning:
          reasoningBlocks.length > 0
            ? reasoningBlocks.join("\n\n")
            : undefined,
      };
    }
  }

  throw new Error("Claude response did not include text content.");
}

function extractOllamaContent(response: unknown): ExtractedModelResponse {
  if (
    response &&
    typeof response === "object" &&
    "message" in response &&
    response.message &&
    typeof response.message === "object" &&
    "content" in response.message &&
    typeof response.message.content === "string"
  ) {
    return {
      content: response.message.content,
    };
  }

  throw new Error("Ollama response did not include message content.");
}

function parseGroqRetryDelayMs(errorText: string) {
  const retryAfterMatch = errorText.match(/try again in\s+([\d.]+)s/i);

  if (!retryAfterMatch) {
    return null;
  }

  const seconds = Number.parseFloat(retryAfterMatch[1]);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  return Math.min(
    Math.ceil(seconds * 1000) + 250,
    GROQ_RATE_LIMIT_MAX_WAIT_MS
  );
}

function isGroqRateLimitError(
  errorCode: string | null,
  errorText: string
) {
  return (
    errorCode === "rate_limit_exceeded" ||
    /"code":"rate_limit_exceeded"/.test(errorText) ||
    /rate limit reached/i.test(errorText)
  );
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriableStructuredRequestError(error: unknown) {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return (
    message.includes("timed out") ||
    message.includes("rate limit") ||
    message.includes("429") ||
    message.includes("500") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504") ||
    message.includes("overloaded") ||
    message.includes("temporarily unavailable") ||
    message.includes("econnreset") ||
    message.includes("socket hang up") ||
    message.includes("network error")
  );
}

async function withStructuredRequestRetry<T>(
  request: () => Promise<T>
): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= STRUCTURED_REQUEST_MAX_RETRIES) {
    try {
      return await request();
    } catch (error) {
      lastError = error;

      if (
        attempt >= STRUCTURED_REQUEST_MAX_RETRIES ||
        !isRetriableStructuredRequestError(error)
      ) {
        throw error;
      }

      const delayMs =
        STRUCTURED_REQUEST_RETRY_BASE_DELAY_MS * (attempt + 1);

      await wait(delayMs);
      attempt += 1;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Structured request failed.");
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  provider?: WorkflowProvider
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const url = String(input);

<<<<<<< HEAD
    // Only force node:https for internal/corporate gateways that need the
    // additional trust bundle. Public provider APIs should use normal fetch.
    if (shouldUseCorporateTls(url)) {
      logTransportPathOnce("corporate-tls", url, provider);
=======
    // Route requests with custom TLS needs through node:https immediately so
    // host/provider overrides apply on the first attempt.
    if (shouldUseCustomTls(url, provider)) {
      console.info("[workflow-runtime] using custom TLS path", {
        provider,
        host: getHostname(url),
        caPath: CONFIGURED_CA_CERT_PATH || "certs/mphasis-chain.pem",
        insecureTls: shouldAllowInsecureTls(url, provider),
      });
>>>>>>> 0e5407c (refactor: enhance TLS handling for custom providers and improve request routing)
      return await httpsRequestToResponse(
        url,
        init,
        controller.signal,
        provider
      );
    }

    try {
      logTransportPathOnce("fetch", url, provider);
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (
        url.startsWith("https://") &&
        isTlsCertificateError(error)
      ) {
        console.warn("[workflow-runtime] fetch TLS failed, retrying with https", {
          provider,
          host: getHostname(url),
          caPath: CONFIGURED_CA_CERT_PATH || null,
          insecureTls: shouldAllowInsecureTls(url, provider),
          error:
            error instanceof Error
              ? error.message
              : "Unknown TLS error",
        });
        return await httpsRequestToResponse(
          url,
          init,
          controller.signal,
          provider
        );
      }

      throw error;
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Provider request timed out.");
    }

    // Surface the underlying cause (e.g. ENOTFOUND, ECONNREFUSED) from Node.js fetch errors
    if (error instanceof Error) {
      const cause = (error as Error & { cause?: unknown }).cause;
      if (cause instanceof Error) {
        throw new Error(`${error.message}: ${cause.message}`);
      }
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

type StructuredProviderRequestInput = {
  schema: object;
  schemaName: string;
  provider: WorkflowProvider;
  model: WorkflowGenerationModel;
  apiKey: string;
  systemPrompt: string;
  fallbackSystemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
};

async function requestGroqStructured(
  input: StructuredProviderRequestInput
) {
  async function requestWithFormat(
    mode: "strict" | "json_object" | "none"
  ) {
    const responseFormat =
      mode === "strict"
        ? {
            type: "json_schema" as const,
            json_schema: {
              name: input.schemaName,
              strict: true,
              schema: input.schema,
            },
          }
        : mode === "json_object"
          ? ({
              type: "json_object",
            } as const)
          : undefined;

    const response = await fetchWithTimeout(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        messages: [
          {
            role: "system",
            content:
              mode === "none"
                ? input.fallbackSystemPrompt
                : input.systemPrompt,
          },
          {
            role: "user",
            content: input.userPrompt,
          },
        ],
        ...(responseFormat ? { response_format: responseFormat } : {}),
        ...(input.maxTokens
          ? {
              max_completion_tokens: input.maxTokens,
              max_tokens: input.maxTokens,
            }
          : {}),
        temperature: 0.2,
      }),
    }, input.provider);

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null);
      const errorCode =
        errorPayload &&
        typeof errorPayload === "object" &&
        "error" in errorPayload &&
        errorPayload.error &&
        typeof errorPayload.error === "object" &&
        "code" in errorPayload.error &&
        typeof errorPayload.error.code === "string"
          ? errorPayload.error.code
          : null;
      const errorText = errorPayload
        ? JSON.stringify(errorPayload)
        : await response.text();

      return {
        ok: false as const,
        errorCode,
        errorText,
      };
    }

    const raw = await response.json();

    return {
      ok: true as const,
      content: extractOpenAIStyleContent(raw),
    };
  }

  async function requestWithRateLimitRetry(
    mode: "strict" | "json_object" | "none"
  ) {
    let attempt = 0;

    while (true) {
      const result = await requestWithFormat(mode);

      if (result.ok) {
        return result;
      }

      if (
        attempt >= GROQ_RATE_LIMIT_MAX_RETRIES ||
        !isGroqRateLimitError(result.errorCode, result.errorText)
      ) {
        return result;
      }

      const delayMs =
        parseGroqRetryDelayMs(result.errorText) || 1500;

      attempt += 1;
      await wait(delayMs);
    }
  }

  const shouldUseStrict = supportsStrictStructuredOutputs(input.model);
  const firstAttempt = await requestWithRateLimitRetry(
    shouldUseStrict ? "strict" : "json_object"
  );

  if (firstAttempt.ok) {
    return firstAttempt.content;
  }

  if (firstAttempt.errorCode === "json_validate_failed") {
    const fallbackAttempt = await requestWithRateLimitRetry("json_object");

    if (fallbackAttempt.ok) {
      return fallbackAttempt.content;
    }

    if (fallbackAttempt.errorCode === "json_validate_failed") {
      const noFormatAttempt = await requestWithRateLimitRetry("none");

      if (noFormatAttempt.ok) {
        return noFormatAttempt.content;
      }

      throw new Error(`Groq request failed: ${noFormatAttempt.errorText}`);
    }

    throw new Error(`Groq request failed: ${fallbackAttempt.errorText}`);
  }

  throw new Error(`Groq request failed: ${firstAttempt.errorText}`);
}

async function requestOpenAIStructured(
  input: StructuredProviderRequestInput
) {
  const response = await fetchWithTimeout(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      messages: [
        {
          role: "system",
          content: input.systemPrompt,
        },
        {
          role: "user",
          content: input.userPrompt,
        },
      ],
      response_format: {
        ...(supportsStrictStructuredOutputs(input.model)
          ? {
              type: "json_schema",
              json_schema: {
                name: input.schemaName,
                strict: true,
                schema: input.schema,
              },
            }
          : {
              type: "json_object",
          }),
      },
      ...(input.maxTokens
        ? {
            max_completion_tokens: input.maxTokens,
            max_tokens: input.maxTokens,
          }
        : {}),
      temperature: 0.2,
    }),
  }, input.provider);

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${await response.text()}`);
  }

  return extractOpenAIStyleContent(await response.json());
}

async function requestClaudeStructured(
  input: StructuredProviderRequestInput
) {
  const response = await fetchWithTimeout(CLAUDE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: input.maxTokens || 2048,
      system: input.systemPrompt,
      messages: [
        {
          role: "user",
          content: input.userPrompt,
        },
      ],
      temperature: 0.2,
    }),
  }, input.provider);

  if (!response.ok) {
    throw new Error(`Claude request failed: ${await response.text()}`);
  }

  return extractClaudeContent(await response.json());
}

async function requestOllamaStructured(
  input: StructuredProviderRequestInput
) {
  const response = await fetchWithTimeout(OLLAMA_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      messages: [
        {
          role: "system",
          content: input.systemPrompt,
        },
        {
          role: "user",
          content: input.userPrompt,
        },
      ],
      stream: false,
      format: "json",
      options: {
        temperature: 0.2,
      },
    }),
  }, input.provider);

  if (!response.ok) {
    throw new Error(`Ollama request failed: ${await response.text()}`);
  }

  return extractOllamaContent(await response.json());
}

export async function requestStructuredJson<T>(
  input: StructuredProviderRequestInput & {
    parse: (outputText: string) => T;
    validate?: (data: T) => void;
    retryUserPrompt?: string;
  }
) {
  const effectiveModel = getEffectiveWorkflowModel(input.provider, input.model);
  const baseRequest = {
    ...input,
    model: effectiveModel,
  };

  const requestPrimary = () =>
    baseRequest.provider === "groq"
      ? requestGroqStructured(baseRequest)
      : baseRequest.provider === "openai"
        ? requestOpenAIStructured(baseRequest)
        : baseRequest.provider === "claude"
          ? requestClaudeStructured(baseRequest)
          : requestOllamaStructured(baseRequest);

  const requestRetry = () => {
    const retryRequest = {
      ...baseRequest,
      userPrompt:
        input.retryUserPrompt ||
        [
          baseRequest.userPrompt,
          "",
          "Return only one raw JSON object.",
          "Do not include commentary, markdown, bullets, or code fences.",
        ].join("\n"),
    };

    return retryRequest.provider === "groq"
      ? requestGroqStructured(retryRequest)
      : retryRequest.provider === "openai"
        ? requestOpenAIStructured(retryRequest)
        : retryRequest.provider === "claude"
          ? requestClaudeStructured(retryRequest)
          : requestOllamaStructured(retryRequest);
  };

  const firstOutput = await withStructuredRequestRetry(requestPrimary);

  try {
    const parsed = input.parse(firstOutput.content);
    input.validate?.(parsed);

    return {
      data: parsed,
      effectiveModel,
      usedModelFallback: effectiveModel !== input.model,
      rawOutput: firstOutput.content,
      reasoning: firstOutput.reasoning,
      warnings: firstOutput.warnings,
    };
  } catch (firstError) {
    const retryOutput = await withStructuredRequestRetry(requestRetry);

    try {
      const parsed = input.parse(retryOutput.content);
      input.validate?.(parsed);

      return {
        data: parsed,
        effectiveModel,
        usedModelFallback: effectiveModel !== input.model,
        rawOutput: retryOutput.content,
        reasoning: retryOutput.reasoning,
        warnings: retryOutput.warnings,
      };
    } catch {
      throw firstError;
    }
  }
}
