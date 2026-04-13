import { NextResponse } from "next/server";
import type {
  GeneratedWorkflowNodeDetails,
  WorkflowNodeDetailsRequest,
  WorkflowProvider,
} from "@/lib/workflow-generation";
import {
  getDefaultWorkflowModel,
  isWorkflowGenerationModel,
  isWorkflowProvider,
  WORKFLOW_NODE_DETAILS_SCHEMA,
} from "@/lib/workflow-generation";
import {
  createRequestId,
  getEffectiveWorkflowModel,
  MISSING_API_KEY_MESSAGES,
  parseJsonObjectFromText,
  requestStructuredJson,
  resolveApiKey,
  validateApiKeyForProvider,
} from "@/lib/workflow-agent-runtime";

export const runtime = "nodejs";

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

function normalizeNodeList(
  value: unknown
): Array<{ id: string; label: string }> {
  return Array.isArray(value)
    ? value
        .filter(
          (node): node is Record<string, unknown> =>
            typeof node === "object" && node !== null
        )
        .map((node) => ({
          id: sanitizeText(node.id, 120),
          label: sanitizeText(node.label, 200),
        }))
        .filter((node) => node.id && node.label)
    : [];
}

function normalizeRequest(
  payload: unknown
): WorkflowNodeDetailsRequest | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const provider = normalizeProvider(record.provider);
  const model = isWorkflowGenerationModel(record.model)
    ? record.model
    : getDefaultWorkflowModel(provider);

  const node =
    typeof record.node === "object" && record.node !== null
      ? {
          id: sanitizeText((record.node as Record<string, unknown>).id, 120),
          label: sanitizeText((record.node as Record<string, unknown>).label, 200),
          description: sanitizeText(
            (record.node as Record<string, unknown>).description,
            300
          ),
        }
      : null;

  if (!node?.id || !node.label) {
    return null;
  }

  const context =
    typeof record.context === "object" && record.context !== null
      ? {
          workflowTitle: sanitizeText(
            (record.context as Record<string, unknown>).workflowTitle,
            200
          ),
          workflowSummary: sanitizeText(
            (record.context as Record<string, unknown>).workflowSummary,
            600
          ),
          previousSteps: normalizeNodeList(
            (record.context as Record<string, unknown>).previousSteps
          ),
          nextSteps: normalizeNodeList(
            (record.context as Record<string, unknown>).nextSteps
          ),
        }
      : undefined;

  return {
    prompt: sanitizeText(record.prompt, 8000),
    model,
    provider,
    apiKey: sanitizeText(record.apiKey, 500),
    node,
    context,
  };
}

function buildPrompt(input: WorkflowNodeDetailsRequest) {
  return [
    "Write the sheet content for exactly one workflow step.",
    "Return only description, details, and suggestions.",
    "Do not rename the step.",
    "Do not invent new nodes, branching, or business rules outside the provided context.",
    "description must be one short sentence.",
    "details should be concise and practical.",
    "suggestions should be short, actionable guidance.",
    "",
    `Workflow goal:\n${input.prompt}`,
    "",
    `Current step:\n${JSON.stringify(input.node, null, 2)}`,
    "",
    input.context
      ? `Local step context:\n${JSON.stringify(input.context, null, 2)}`
      : "Local step context:\nNone",
  ].join("\n");
}

function parseGeneratedNodeDetails(
  outputText: string
): GeneratedWorkflowNodeDetails {
  return parseJsonObjectFromText<GeneratedWorkflowNodeDetails>(
    outputText,
    "Model output"
  );
}

function validateNodeDetails(
  nodeDetails: GeneratedWorkflowNodeDetails
) {
  if (!nodeDetails.description?.trim()) {
    throw new Error("Node details must include a description.");
  }

  if (!nodeDetails.details?.trim()) {
    throw new Error("Node details must include details.");
  }

  if (!nodeDetails.suggestions?.trim()) {
    throw new Error("Node details must include suggestions.");
  }
}

function normalizeNodeDetails(
  nodeDetails: GeneratedWorkflowNodeDetails
): GeneratedWorkflowNodeDetails {
  return {
    description: nodeDetails.description.trim(),
    details: nodeDetails.details.trim(),
    suggestions: nodeDetails.suggestions.trim(),
  };
}

export async function POST(request: Request) {
  const requestId = createRequestId();
  let rawPayload: unknown;

  try {
    rawPayload = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Invalid request body.",
        requestId,
      },
      { status: 400 }
    );
  }

  const payload = normalizeRequest(rawPayload);

  if (!payload) {
    return NextResponse.json(
      {
        error: "Request payload must be a JSON object with a valid node.",
        requestId,
      },
      { status: 400 }
    );
  }

  if (!payload.prompt?.trim()) {
    return NextResponse.json(
      {
        error: "Prompt is required.",
        requestId,
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
        requestId,
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
          requestId,
        },
        { status: 400 }
      );
    }
  }

  try {
    const result = await requestStructuredJson({
      schema: WORKFLOW_NODE_DETAILS_SCHEMA,
      schemaName: "workflow_node_details",
      provider,
      model: payload.model,
      apiKey,
      systemPrompt:
        "You are a workflow detail writer. Return only valid JSON matching the supplied schema.",
      fallbackSystemPrompt:
        "You are a workflow detail writer. Return ONLY one valid JSON object and no markdown.",
      userPrompt: buildPrompt(payload),
      maxTokens: 2048,
      parse: parseGeneratedNodeDetails,
    });

    const normalizedNodeDetails =
      normalizeNodeDetails(result.data);

    validateNodeDetails(normalizedNodeDetails);

    return NextResponse.json({
      nodeDetails: normalizedNodeDetails,
      meta: {
        requestId,
        model: result.effectiveModel,
        usedModelFallback: result.usedModelFallback,
        requestedModel: payload.model,
      },
    }, {
      headers: {
        "x-request-id": requestId,
        "x-workflow-model": result.effectiveModel,
      },
    });
  } catch (error) {
    const details =
      error instanceof Error ? error.message : "Unknown error";

    console.error("[workflow/node-details]", {
      requestId,
      provider,
      model: payload.model,
      effectiveModel: getEffectiveWorkflowModel(provider, payload.model),
      nodeId: payload.node.id,
      error: details,
    });

    return NextResponse.json(
      {
        error: "Failed to generate workflow node details.",
        details,
        requestId,
      },
      {
        status: 500,
        headers: {
          "x-request-id": requestId,
        },
      }
    );
  }
}
