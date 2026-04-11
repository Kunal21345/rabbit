# AI Workflow Builder

A Next.js workflow editor for designing and refining node-based business workflows with AI assistance.

## What It Does

- Renders a draggable workflow canvas with persistent node positions
- Lets you edit node descriptions, business rules, generated rules, and comments
- Generates or replaces workflow graphs from natural-language prompts
- Supports multiple providers for workflow generation: OpenAI, Claude, Groq, and Ollama
- Stores graph state and provider settings locally in the browser

## Tech Stack

- Next.js App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Custom canvas renderer
- LLM provider adapters in a server route

## Environment

Set the providers you want to use in `.env.local`.

```bash
GROQ_API_KEY=your_groq_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
OLLAMA_API_URL=http://localhost:11434/api/chat
```

Only the providers you actually plan to use need keys. Ollama is optional and defaults to a local server URL.

## Development

Install dependencies and run the development server with your package manager of choice.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Main Runtime Paths

- `app/page.tsx`: main workflow builder screen
- `app/api/workflow/generate/route.ts`: workflow generation API route
- `hooks/useWorkflowGraph.ts`: graph state mutations
- `hooks/useWorkflowPersistenceState.ts`: local persistence and restore
- `hooks/useWorkflowGeneration.ts`: client-side workflow generation orchestration
- `hooks/useResizableChatbotPanel.ts`: chatbot panel sizing behavior
- `lib/workflow-generation.ts`: shared generation types, options, normalization, graph building

## Production Notes

- Workflow node positions persist locally in the browser
- Provider requests use server-side fetch timeouts and normalized request parsing
- Per-node AI rule generation is intentionally not faked; rule/test fields are edited directly unless the feature is implemented for real

## Verification

This repo expects a working Node.js toolchain to run:

```bash
npm run lint
npm run build
```

If those commands fail locally, confirm `node` and `npm` are available on `PATH`.
