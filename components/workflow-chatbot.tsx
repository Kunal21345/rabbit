"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ArrowUpIcon, Settings2Icon, SquarePen } from "lucide-react";
import {
  Message,
  MessageContent,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
} from "@/components/ai-elements/prompt-input";
import {
  getDefaultWorkflowModel,
  isExperimentalWorkflowModel,
  isWorkflowGenerationModel,
  isWorkflowProvider,
  LLM_MODEL_STORAGE_KEY,
  LLM_PROVIDER_STORAGE_KEY,
  WORKFLOW_MODEL_OPTIONS_BY_PROVIDER,
  WORKFLOW_PROVIDER_OPTIONS,
  type WorkflowGenerationModel,
  type WorkflowProvider,
} from "@/lib/workflow-generation";
import { cn } from "@/lib/utils";

type ChatRole = "assistant" | "user";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  reasoning?: string;
  warnings?: string[];
  model?: string;
};

type SubmitResult = {
  ok: boolean;
  message: string;
  llmResponse?: string;
  reasoning?: string;
  warnings?: string[];
  model?: string;
};

type WorkflowChatbotProps = {
  loading?: boolean;
  error?: string | null;
  onSubmit: (
    prompt: string,
    model: WorkflowGenerationModel,
    provider: WorkflowProvider
  ) => Promise<SubmitResult>;
};

function getStoredModel(provider: WorkflowProvider): WorkflowGenerationModel {
  if (typeof window === "undefined") {
    return getDefaultWorkflowModel(provider);
  }

  const stored = localStorage.getItem(LLM_MODEL_STORAGE_KEY);
  const providerModels = WORKFLOW_MODEL_OPTIONS_BY_PROVIDER[provider];

  if (
    isWorkflowGenerationModel(stored) &&
    providerModels.some((m) => m.value === stored)
  ) {
    return stored;
  }

  return getDefaultWorkflowModel(provider);
}

function getModelForProvider(
  provider: WorkflowProvider,
  currentModel: WorkflowGenerationModel
): WorkflowGenerationModel {
  const supportedModels = WORKFLOW_MODEL_OPTIONS_BY_PROVIDER[provider];

  if (
    supportedModels.some((candidate) => candidate.value === currentModel)
  ) {
    return currentModel;
  }

  return getDefaultWorkflowModel(provider);
}

function createMessage(
  role: ChatRole,
  content: string,
  extra?: Partial<Omit<ChatMessage, "id" | "role" | "content">>
): ChatMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    ...extra,
  };
}

function normalizeReasoning(reasoning?: string) {
  if (!reasoning) {
    return undefined;
  }

  const trimmed = reasoning.trim();

  if (!trimmed) {
    return undefined;
  }

  if (
    trimmed.startsWith("{") ||
    trimmed.startsWith("[") ||
    trimmed.startsWith("```json") ||
    trimmed.startsWith("```")
  ) {
    return undefined;
  }

  return trimmed;
}

function normalizeResponseMessage(message?: string, fallback?: string) {
  const trimmed = message?.trim();

  if (
    trimmed &&
    !trimmed.startsWith("{") &&
    !trimmed.startsWith("[") &&
    !trimmed.startsWith("```")
  ) {
    return trimmed;
  }

  return fallback?.trim() || "Workflow updated.";
}

const INITIAL_MESSAGE = createMessage(
  "assistant",
  "Describe your workflow and I will build or update the graph for you."
);

export function WorkflowChatbot({
  loading = false,
  error,
  onSubmit,
}: WorkflowChatbotProps) {
  const [draft, setDraft] = useState("");
  const [provider, setProvider] = useState<WorkflowProvider>("groq");
  const [model, setModel] = useState<WorkflowGenerationModel>(() =>
    getDefaultWorkflowModel("groq")
  );
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsProvider, setSettingsProvider] = useState<WorkflowProvider>("groq");
  const [settingsModel, setSettingsModel] = useState<WorkflowGenerationModel>(
    getDefaultWorkflowModel("groq")
  );
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  const canSubmit = Boolean(draft.trim()) && !loading;

  const modelOptions = WORKFLOW_MODEL_OPTIONS_BY_PROVIDER[provider];
  const settingsModelOptions =
    WORKFLOW_MODEL_OPTIONS_BY_PROVIDER[settingsProvider];
  const selectedModelIsExperimental =
    isExperimentalWorkflowModel(model);
  const activeProviderLabel =
    WORKFLOW_PROVIDER_OPTIONS.find((candidate) => candidate.value === provider)
      ?.label || "Provider";
  const activeModelLabel =
    modelOptions.find((candidate) => candidate.value === model)?.label || model;

  useEffect(() => {
    const syncStoredSettings = () => {
      const storedProviderRaw = localStorage.getItem(LLM_PROVIDER_STORAGE_KEY);
      const nextProvider = isWorkflowProvider(storedProviderRaw)
        ? storedProviderRaw
        : "groq";
      const nextModel = getStoredModel(nextProvider);

      setProvider(nextProvider);
      setModel(nextModel);
      setSettingsProvider(nextProvider);
      setSettingsModel(nextModel);
    };

    const timeoutId = window.setTimeout(syncStoredSettings, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const viewport =
      scrollAreaRef.current?.querySelector<HTMLDivElement>(
        '[data-slot="scroll-area-viewport"]'
      ) ?? null;

    if (!viewport) return;

    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  const sendPrompt = useCallback(async () => {
    const prompt = draft.trim();

    if (!prompt || loading) return;

    setDraft("");
    setMessages((current) => [...current, createMessage("user", prompt)]);

    try {
      const result = await onSubmit(
        prompt,
        model,
        provider
      );

      setMessages((current) => [
        ...current,
        createMessage(
          "assistant",
          normalizeResponseMessage(result.llmResponse, result.message),
          {
            reasoning: normalizeReasoning(result.reasoning),
            warnings: result.warnings?.filter(Boolean),
            model: result.model,
          }
        ),
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        createMessage("assistant", "Something went wrong. Please try again."),
      ]);
    }
  }, [draft, loading, model, onSubmit, provider]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await sendPrompt();
    },
    [sendPrompt]
  );

  const handleKeyDown = useCallback(
    async (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        await sendPrompt();
      }
    },
    [sendPrompt]
  );

  const handleResetChat = useCallback(() => {
    if (loading) return;

    setMessages([INITIAL_MESSAGE]);
  }, [loading]);

  const handleOpenSettings = useCallback(() => {
    setSettingsProvider(provider);
    setSettingsModel(model);
    setSettingsOpen(true);
  }, [model, provider]);

  const handleProviderChange = useCallback((nextProvider: WorkflowProvider) => {
    setProvider(nextProvider);
    setModel((currentModel) => {
      const nextModel = getModelForProvider(nextProvider, currentModel);
      localStorage.setItem(LLM_MODEL_STORAGE_KEY, nextModel);
      return nextModel;
    });
    localStorage.setItem(LLM_PROVIDER_STORAGE_KEY, nextProvider);
  }, []);

  const handleSaveSettings = useCallback(() => {
    const nextModel = getModelForProvider(settingsProvider, settingsModel);

    setModel(nextModel);
    localStorage.setItem(LLM_MODEL_STORAGE_KEY, nextModel);
    handleProviderChange(settingsProvider);
    setSettingsOpen(false);
  }, [handleProviderChange, settingsModel, settingsProvider]);

  return (
    <div className="h-full w-full">
      <section className="flex h-full w-full flex-col overflow-hidden bg-background">
        <header className="flex h-11 items-center justify-between border-b border-border px-3">
          <div>
            <p className="text-xs font-semibold tracking-wide text-foreground">
              Workflow Chatbot
            </p>
          </div>

          <div className="flex items-center gap-1">
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Chatbot settings"
                    className="rounded-sm text-muted-foreground"
                    onClick={handleOpenSettings}
                  >
                    <Settings2Icon data-icon="inline-start" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Settings</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleResetChat}
                    disabled={loading}
                    aria-label="Reset chat"
                    className="rounded-sm text-muted-foreground"
                  >
                    <SquarePen data-icon="inline-start" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Reset chat</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </header>

        <ScrollArea ref={scrollAreaRef} className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 px-4 py-4">
            {messages.map((message) => (
              <Message
                key={message.id}
                from={message.role}
                className="max-w-full"
              >
                <div className="max-w-[92%]">
                  {message.role === "assistant" && message.reasoning ? (
                    <Reasoning className="mb-3" defaultOpen={false}>
                      <ReasoningTrigger />
                      <ReasoningContent>{message.reasoning}</ReasoningContent>
                    </Reasoning>
                  ) : null}

                  <MessageContent
                    className={cn(
                      "rounded-2xl px-4 py-3",
                      message.role === "assistant" &&
                        "border border-border bg-card"
                    )}
                  >
                    {message.warnings?.length ? (
                      <div className="mb-3 flex flex-col gap-2">
                        {message.warnings.map((warning, index) => (
                          <div
                            key={`${message.id}-warning-${index}`}
                            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900"
                          >
                            AI SDK Warning: {warning}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                      {message.content}
                    </p>

                    {message.model ? (
                      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                        {message.model ? <span>Model: {message.model}</span> : null}
                      </div>
                    ) : null}
                  </MessageContent>
                </div>
              </Message>
            ))}

            {loading ? (
              <Message from="assistant" className="max-w-full">
                <div className="max-w-[92%]">
                  <MessageContent className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                    <Shimmer duration={1.4}>Generating workflow...</Shimmer>
                  </MessageContent>
                </div>
              </Message>
            ) : null}
          </div>
        </ScrollArea>

        <form className="border-t border-border bg-background p-3" onSubmit={handleSubmit}>
          <InputGroup className="overflow-hidden rounded-2xl border-border bg-card">
            <InputGroupTextarea
              className="field-sizing-content max-h-48 min-h-16"
              disabled={loading}
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your workflow and I'll build or update the graph..."
              value={draft}
            />

            <InputGroupAddon align="block-end" className="justify-between gap-1">
              <div className="px-2 text-[11px] text-muted-foreground">
                {activeProviderLabel} · {activeModelLabel}
              </div>

              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InputGroupButton
                      aria-label="Send"
                      type="submit"
                      size="icon-sm"
                      variant="default"
                      className="rounded-full"
                      disabled={!canSubmit}
                    >
                      <ArrowUpIcon />
                    </InputGroupButton>
                  </TooltipTrigger>
                  <TooltipContent side="top">Send message</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </InputGroupAddon>
          </InputGroup>

          {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
          {selectedModelIsExperimental ? (
            <p className="mt-2 text-xs text-amber-600">
              GPT OSS 20B is experimental here and can return messy structured
              output. For cleaner workflow graphs, use GPT OSS 120B, Llama 3.3
              70B, or GPT-4.1 Mini.
            </p>
          ) : null}
        </form>
      </section>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>LLM Settings</SheetTitle>
            <SheetDescription>
              Choose the provider and model. API keys are read from server-side environment variables in `.env.local`.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="llm-provider">API provider</Label>
              <PromptInputSelect
                value={settingsProvider}
                onValueChange={(value) => {
                  const nextProvider = value as WorkflowProvider;
                  setSettingsProvider(nextProvider);
                  setSettingsModel((currentModel) =>
                    getModelForProvider(nextProvider, currentModel)
                  );
                }}
              >
                <PromptInputSelectTrigger id="llm-provider" className="h-9 w-full rounded-md">
                  <PromptInputSelectValue />
                </PromptInputSelectTrigger>
                <PromptInputSelectContent>
                  {WORKFLOW_PROVIDER_OPTIONS.map((option) => (
                    <PromptInputSelectItem key={option.value} value={option.value}>
                      {option.label}
                    </PromptInputSelectItem>
                  ))}
                </PromptInputSelectContent>
              </PromptInputSelect>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="llm-model">Model</Label>
              <PromptInputSelect
                value={settingsModel}
                onValueChange={(value) =>
                  setSettingsModel(value as WorkflowGenerationModel)
                }
              >
                <PromptInputSelectTrigger id="llm-model" className="h-9 w-full rounded-md">
                  <PromptInputSelectValue />
                </PromptInputSelectTrigger>
                <PromptInputSelectContent>
                  {settingsModelOptions.map((option) => (
                    <PromptInputSelectItem key={option.value} value={option.value}>
                      {option.label}
                    </PromptInputSelectItem>
                  ))}
                </PromptInputSelectContent>
              </PromptInputSelect>
            </div>

            <p className="text-xs text-muted-foreground">
              Configure the matching server env var for your provider:
              {settingsProvider === "openai"
                ? " OPENAI_API_KEY"
                : settingsProvider === "claude"
                  ? " ANTHROPIC_API_KEY"
                  : settingsProvider === "groq"
                    ? " GROQ_API_KEY"
                    : " OLLAMA_API_URL (optional for local Ollama)"}
            </p>

            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setSettingsOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSaveSettings}>
                Save
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
