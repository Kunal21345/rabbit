import {
  getDefaultWorkflowModel,
  isExperimentalWorkflowModel,
  type WorkflowGenerationModel,
  type WorkflowProvider,
} from "@/lib/workflow-generation";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const OLLAMA_API_URL =
  process.env.OLLAMA_API_URL || "http://localhost:11434/api/chat";
const PROVIDER_TIMEOUT_MS = 30000;
const GROQ_RATE_LIMIT_MAX_RETRIES = 1;
const GROQ_RATE_LIMIT_MAX_WAIT_MS = 8000;

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

export function resolveApiKey(
  provider: WorkflowProvider,
  inlineApiKey?: string
): string {
  const requestApiKey = inlineApiKey?.trim();

  if (requestApiKey) {
    return requestApiKey;
  }

  if (provider === "groq") {
    return process.env.GROQ_API_KEY || "";
  }

  if (provider === "openai") {
    return process.env.OPENAI_API_KEY || "";
  }

  if (provider === "claude") {
    return process.env.ANTHROPIC_API_KEY || "";
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

  if (provider === "claude" && !apiKey.startsWith("sk-ant-")) {
    return "Selected provider is Claude, but the key format does not look like a Claude key (expected prefix: sk-ant-).";
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

function extractOpenAIStyleContent(response: unknown) {
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
      typeof choice.message === "object" &&
      "content" in choice.message
    ) {
      const content = choice.message.content;

      if (typeof content === "string") {
        return content;
      }

      if (Array.isArray(content)) {
        const textParts = content
          .filter(
            (part): part is { type: string; text: string } =>
              typeof part === "object" &&
              part !== null &&
              "type" in part &&
              "text" in part &&
              part.type === "text" &&
              typeof part.text === "string"
          )
          .map((part) => part.text);

        if (textParts.length > 0) {
          return textParts.join("\n");
        }
      }
    }
  }

  throw new Error("Provider response did not include message content.");
}

function extractClaudeContent(response: unknown) {
  if (
    response &&
    typeof response === "object" &&
    "content" in response &&
    Array.isArray(response.content)
  ) {
    const textBlocks = response.content
      .filter(
        (block): block is { type: string; text: string } =>
          typeof block === "object" &&
          block !== null &&
          "type" in block &&
          "text" in block &&
          block.type === "text" &&
          typeof block.text === "string"
      )
      .map((block) => block.text);

    if (textBlocks.length > 0) {
      return textBlocks.join("\n");
    }
  }

  throw new Error("Claude response did not include text content.");
}

function extractOllamaContent(response: unknown) {
  if (
    response &&
    typeof response === "object" &&
    "message" in response &&
    response.message &&
    typeof response.message === "object" &&
    "content" in response.message &&
    typeof response.message.content === "string"
  ) {
    return response.message.content;
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

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Provider request timed out.");
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
        temperature: 0.2,
      }),
    });

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
      temperature: 0.2,
    }),
  });

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
  });

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
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed: ${await response.text()}`);
  }

  return extractOllamaContent(await response.json());
}

export async function requestStructuredJson<T>(
  input: StructuredProviderRequestInput & {
    parse: (outputText: string) => T;
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

  const firstOutput = await requestPrimary();

  try {
    return {
      data: input.parse(firstOutput),
      effectiveModel,
      usedModelFallback: effectiveModel !== input.model,
    };
  } catch (firstError) {
    const retryOutput = await requestRetry();

    try {
      return {
        data: input.parse(retryOutput),
        effectiveModel,
        usedModelFallback: effectiveModel !== input.model,
      };
    } catch {
      throw firstError;
    }
  }
}
