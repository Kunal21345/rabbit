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

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const MISSING_API_KEY_MESSAGE =
  "Missing OPENAI_API_KEY. Add it to .env.local and restart the dev server.";

function buildPrompt(input: WorkflowGenerationRequest) {
  return [
    "Generate a complete workflow graph from the user's use case.",
    "Return the final workflow, not a patch.",
    "The graph may add, remove, or rename nodes as needed.",
    "Every node must have stable slug-style ids.",
    "Use at most two outgoing edges per node.",
    "If a node has one outgoing edge, use label YES.",
    "If a node has two outgoing edges, use YES and NO.",
    "Prefer explicit start and end nodes when appropriate.",
    "businessRule should explain what the node does in business terms.",
    "aiRuleDefinition should be valid JavaScript only when a branch decision is needed. Otherwise leave it empty.",
    "aiTestRules should contain concise example cases for branching logic when useful. Otherwise leave it empty.",
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
    "output_text" in response &&
    typeof response.output_text === "string"
  ) {
    return response.output_text;
  }

  throw new Error("OpenAI response did not include output_text");
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

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
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: payload.model,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: "You are a workflow architect. Return only valid JSON matching the supplied schema.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: buildPrompt(payload),
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "workflow_graph",
            schema: WORKFLOW_GENERATION_SCHEMA,
            strict: true,
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();

      return NextResponse.json(
        {
          error: "OpenAI request failed.",
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
  const configured = Boolean(process.env.OPENAI_API_KEY);

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
