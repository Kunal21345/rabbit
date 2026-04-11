import { NextResponse } from "next/server";
import type {
  GeneratedWorkflow,
  WorkflowGenerationRequest,
  WorkflowProvider,
} from "@/lib/workflow-generation";
import {
  getDefaultWorkflowModel,
  isWorkflowGenerationModel,
  isWorkflowProvider,
  WORKFLOW_GENERATION_SCHEMA,
  buildWorkflowGraph,
} from "@/lib/workflow-generation";

export const runtime = "nodejs";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const OLLAMA_API_URL =
  process.env.OLLAMA_API_URL || "http://localhost:11434/api/chat";
const PROVIDER_TIMEOUT_MS = 30000;

const MISSING_API_KEY_MESSAGES: Record<
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

function supportsStrictStructuredOutputs(model: string) {
  return (
    model === "openai/gpt-oss-20b" ||
    model === "openai/gpt-oss-120b" ||
    model.startsWith("gpt-")
  );
}

function normalizeProvider(provider: unknown): WorkflowProvider {
  if (isWorkflowProvider(provider)) {
    return provider;
  }

  return "groq";
}

function sanitizeText(value: unknown, maxLength = 4000) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function normalizeRequest(
  payload: unknown
): WorkflowGenerationRequest | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const provider = normalizeProvider(record.provider);
  const model = isWorkflowGenerationModel(record.model)
    ? record.model
    : getDefaultWorkflowModel(provider);

  const currentGraph =
    typeof record.currentGraph === "object" &&
    record.currentGraph !== null
      ? {
          nodes: Array.isArray((record.currentGraph as Record<string, unknown>).nodes)
            ? ((record.currentGraph as Record<string, unknown>).nodes as unknown[])
                .filter(
                  (node): node is Record<string, unknown> =>
                    typeof node === "object" && node !== null
                )
                .map((node) => ({
                  id: sanitizeText(node.id, 120),
                  label: sanitizeText(node.label, 200),
                  description: sanitizeText(node.description, 1000),
                  businessRule: sanitizeText(node.businessRule, 2000),
                }))
            : [],
          edges: Array.isArray((record.currentGraph as Record<string, unknown>).edges)
            ? ((record.currentGraph as Record<string, unknown>).edges as unknown[])
                .filter(
                  (edge): edge is Record<string, unknown> =>
                    typeof edge === "object" && edge !== null
                )
                .map((edge) => ({
                  source: sanitizeText(edge.source, 120),
                  target: sanitizeText(edge.target, 120),
                }))
                .filter((edge) => edge.source && edge.target)
            : [],
        }
      : undefined;

  return {
    prompt: sanitizeText(record.prompt, 8000),
    model,
    provider,
    apiKey: sanitizeText(record.apiKey, 500),
    currentGraph,
  };
}

function resolveApiKey(
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

function validateApiKeyForProvider(
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

function buildPrompt(input: WorkflowGenerationRequest) {
  return [
    "Generate a complete workflow graph from the user's use case.",
    "Return the final workflow, not a patch.",
    "The graph may add, remove, or rename nodes as needed.",
    "Every node must have stable slug-style ids.",
    "Use direct unlabeled edges between nodes.",
    "A node may connect to multiple target nodes when the workflow needs branching.",
    "Prefer explicit start and end nodes when appropriate.",
    "businessRule should explain what the node does in business terms.",
    "aiRuleDefinition should be valid JavaScript only when extra rule logic is needed. Otherwise leave it empty.",
    "aiTestRules should contain concise example cases when useful. Otherwise leave it empty.",
    "comments can capture assumptions or caveats.",
    "",
    `User use case:\n${input.prompt}`,
    "",
    input.currentGraph
      ? `Current graph context:\n${JSON.stringify(input.currentGraph, null, 2)}`
      : "Current graph context:\nNone",
  ].join("\n");
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
      "content" in choice.message &&
      typeof choice.message.content === "string"
    ) {
      return choice.message.content;
    }
  }

  throw new Error("Provider response did not include message content");
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

  throw new Error("Claude response did not include text content");
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

  throw new Error("Ollama response did not include message content");
}

function parseGeneratedWorkflow(
  outputText: string
): GeneratedWorkflow {
  try {
    return JSON.parse(outputText) as GeneratedWorkflow;
  } catch {
    const firstBrace = outputText.indexOf("{");
    const lastBrace = outputText.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error("Model output did not contain a JSON object.");
    }

    const jsonSlice = outputText.slice(firstBrace, lastBrace + 1);
    return JSON.parse(jsonSlice) as GeneratedWorkflow;
  }
}

async function requestGroq(
  payload: WorkflowGenerationRequest,
  apiKey: string
) {
  async function requestWithFormat(
    mode: "strict" | "json_object" | "none"
  ) {
    const responseFormat =
      mode === "strict"
        ? {
            type: "json_schema" as const,
            json_schema: {
              name: "workflow_graph",
              strict: true,
              schema: WORKFLOW_GENERATION_SCHEMA,
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
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: payload.model,
        messages: [
          {
            role: "system",
            content:
              mode === "none"
                ? "You are a workflow architect. Return ONLY valid JSON object and no markdown."
                : "You are a workflow architect. Return only valid JSON matching the supplied schema.",
          },
          {
            role: "user",
            content: buildPrompt(payload),
          },
        ],
        ...(responseFormat ? { response_format: responseFormat } : {}),
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errorPayload = await response
        .json()
        .catch(() => null);

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

  const shouldUseStrict =
    supportsStrictStructuredOutputs(payload.model);
  const firstAttempt = await requestWithFormat(
    shouldUseStrict ? "strict" : "json_object"
  );

  if (firstAttempt.ok) {
    return firstAttempt.content;
  }

  if (
    firstAttempt.errorCode === "json_validate_failed"
  ) {
    const fallbackAttempt = await requestWithFormat("json_object");

    if (fallbackAttempt.ok) {
      return fallbackAttempt.content;
    }

    if (fallbackAttempt.errorCode === "json_validate_failed") {
      const noFormatAttempt = await requestWithFormat("none");

      if (noFormatAttempt.ok) {
        return noFormatAttempt.content;
      }

      throw new Error(
        `Groq request failed: ${noFormatAttempt.errorText}`
      );
    }

    throw new Error(
      `Groq request failed: ${fallbackAttempt.errorText}`
    );
  }

  throw new Error(
    `Groq request failed: ${firstAttempt.errorText}`
  );
}

async function requestOpenAI(
  payload: WorkflowGenerationRequest,
  apiKey: string
) {
  const response = await fetchWithTimeout(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: payload.model,
      messages: [
        {
          role: "system",
          content:
            "You are a workflow architect. Return only valid JSON matching the supplied schema.",
        },
        {
          role: "user",
          content: buildPrompt(payload),
        },
      ],
      response_format: {
        ...(supportsStrictStructuredOutputs(payload.model)
          ? {
              type: "json_schema",
              json_schema: {
                name: "workflow_graph",
                strict: true,
                schema: WORKFLOW_GENERATION_SCHEMA,
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
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${errorText}`);
  }

  const raw = await response.json();
  return extractOpenAIStyleContent(raw);
}

async function requestClaude(
  payload: WorkflowGenerationRequest,
  apiKey: string
) {
  const response = await fetchWithTimeout(CLAUDE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: payload.model,
      max_tokens: 4096,
      system:
        "You are a workflow architect. Return only valid JSON with keys: title, summary, nodes, edges.",
      messages: [
        {
          role: "user",
          content: buildPrompt(payload),
        },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude request failed: ${errorText}`);
  }

  const raw = await response.json();
  return extractClaudeContent(raw);
}

async function requestOllama(payload: WorkflowGenerationRequest) {
  const response = await fetchWithTimeout(OLLAMA_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: payload.model,
      messages: [
        {
          role: "system",
          content:
            "You are a workflow architect. Return only valid JSON with keys: title, summary, nodes, edges.",
        },
        {
          role: "user",
          content: buildPrompt(payload),
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
    const errorText = await response.text();
    throw new Error(`Ollama request failed: ${errorText}`);
  }

  const raw = await response.json();
  return extractOllamaContent(raw);
}

export async function POST(request: Request) {
  let rawPayload: unknown;

  try {
    rawPayload = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Invalid request body.",
      },
      { status: 400 }
    );
  }

  const payload = normalizeRequest(rawPayload);

  if (!payload) {
    return NextResponse.json(
      {
        error: "Request payload must be a JSON object.",
      },
      { status: 400 }
    );
  }

  if (!payload.prompt?.trim()) {
    return NextResponse.json(
      {
        error: "Prompt is required.",
      },
      { status: 400 }
    );
  }

  const provider = normalizeProvider(payload.provider);
  const apiKey = resolveApiKey(provider, payload.apiKey);

  if (provider !== "ollama" && !apiKey) {
    return NextResponse.json(
      {
        error: MISSING_API_KEY_MESSAGES[provider],
      },
      { status: 503 }
    );
  }

  if (provider !== "ollama") {
    const validationError = validateApiKeyForProvider(
      provider,
      apiKey
    );

    if (validationError) {
      return NextResponse.json(
        {
          error: validationError,
        },
        { status: 400 }
      );
    }
  }

  try {
    const outputText =
      provider === "groq"
        ? await requestGroq(payload, apiKey)
        : provider === "openai"
          ? await requestOpenAI(payload, apiKey)
          : provider === "claude"
            ? await requestClaude(payload, apiKey)
            : await requestOllama(payload);

    const generatedWorkflow = parseGeneratedWorkflow(outputText);
    const graph = buildWorkflowGraph(generatedWorkflow);

    return NextResponse.json({
      workflow: generatedWorkflow,
      graph,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to generate workflow graph.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const provider = normalizeProvider(url.searchParams.get("provider"));

  if (provider === "ollama") {
    return NextResponse.json({ configured: true, provider });
  }

  const configured = Boolean(resolveApiKey(provider));

  return NextResponse.json(
    configured
      ? { configured: true, provider }
      : {
          configured: false,
          provider,
          error: MISSING_API_KEY_MESSAGES[provider],
        },
    { status: configured ? 200 : 503 }
  );
}
