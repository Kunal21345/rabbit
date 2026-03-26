import { NextResponse } from "next/server";
import type {
  GeneratedWorkflow,
  WorkflowGenerationRequest,
} from "@/lib/workflow-generation";
import {
  WORKFLOW_GENERATION_SCHEMA,
  buildWorkflowGraph,
} from "@/lib/workflow-generation";

export const runtime = "nodejs";

const GROQ_API_URL =
  "https://api.groq.com/openai/v1/chat/completions";
const MISSING_API_KEY_MESSAGE =
  "Missing GROQ_API_KEY. Add it to .env.local and restart the dev server.";

function supportsStrictStructuredOutputs(model: string) {
  return (
    model === "openai/gpt-oss-20b" ||
    model === "openai/gpt-oss-120b"
  );
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

function extractTextPayload(response: unknown) {
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

  throw new Error(
    "Groq response did not include assistant message content"
  );
}

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error: MISSING_API_KEY_MESSAGE,
      },
      { status: 503 }
    );
  }

  let payload: WorkflowGenerationRequest;

  try {
    payload = (await request.json()) as WorkflowGenerationRequest;
  } catch {
    return NextResponse.json(
      {
        error: "Invalid request body.",
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

  try {
    const response = await fetch(GROQ_API_URL, {
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

      return NextResponse.json(
        {
          error: "Groq request failed.",
          details: errorText,
        },
        { status: 502 }
      );
    }

    const raw = await response.json();
    const outputText = extractTextPayload(raw);
    const generatedWorkflow = JSON.parse(
      outputText
    ) as GeneratedWorkflow;
    const graph = buildWorkflowGraph(generatedWorkflow);

    return NextResponse.json({
      workflow: generatedWorkflow,
      graph,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to generate workflow graph.",
        details:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  const configured = Boolean(process.env.GROQ_API_KEY);

  return NextResponse.json(
    configured
      ? { configured: true }
      : {
          configured: false,
          error: MISSING_API_KEY_MESSAGE,
        },
    { status: configured ? 200 : 503 }
  );
}
