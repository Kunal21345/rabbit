"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ArrowUpIcon, Settings2Icon, SquarePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  isWorkflowProvider,
  LLM_PROVIDER_API_KEYS_STORAGE_KEY,
  LLM_PROVIDER_STORAGE_KEY,
  WORKFLOW_MODEL_OPTIONS_BY_PROVIDER,
  WORKFLOW_PROVIDER_OPTIONS,
  type WorkflowGenerationModel,
  type WorkflowProvider,
} from "@/lib/workflow-generation";

type ChatRole = "assistant" | "user";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type SubmitResult = {
  ok: boolean;
  message: string;
};

type WorkflowChatbotProps = {
  loading?: boolean;
  error?: string | null;
  onSubmit: (
    prompt: string,
    model: WorkflowGenerationModel,
    provider: WorkflowProvider,
    apiKey?: string
  ) => Promise<SubmitResult>;
};

type ProviderApiKeyMap = Record<WorkflowProvider, string>;

function emptyProviderApiKeys(): ProviderApiKeyMap {
  return {
    openai: "",
    claude: "",
    groq: "",
    ollama: "",
  };
}

function getStoredProvider(): WorkflowProvider {
  if (typeof window === "undefined") {
    return "groq";
  }

  const stored = localStorage.getItem(LLM_PROVIDER_STORAGE_KEY);

  if (isWorkflowProvider(stored)) {
    return stored;
  }

  return "groq";
}

function getStoredProviderApiKeys(): ProviderApiKeyMap {
  if (typeof window === "undefined") {
    return emptyProviderApiKeys();
  }

  try {
    const raw = localStorage.getItem(LLM_PROVIDER_API_KEYS_STORAGE_KEY);

    if (!raw) {
      return emptyProviderApiKeys();
    }

    const parsed = JSON.parse(raw) as Partial<ProviderApiKeyMap>;

    return {
      openai: parsed.openai?.trim() || "",
      claude: parsed.claude?.trim() || "",
      groq: parsed.groq?.trim() || "",
      ollama: parsed.ollama?.trim() || "",
    };
  } catch {
    return emptyProviderApiKeys();
  }
}

function getDefaultModel(provider: WorkflowProvider): WorkflowGenerationModel {
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

  return getDefaultModel(provider);
}

function createMessage(role: ChatRole, content: string): ChatMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
  };
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
  const [provider, setProvider] =
    useState<WorkflowProvider>(getStoredProvider);
  const [model, setModel] = useState<WorkflowGenerationModel>(() =>
    getDefaultModel(getStoredProvider())
  );
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [providerApiKeys, setProviderApiKeys] =
    useState<ProviderApiKeyMap>(getStoredProviderApiKeys);
  const [settingsProvider, setSettingsProvider] =
    useState<WorkflowProvider>(provider);
  const [settingsProviderApiKeys, setSettingsProviderApiKeys] =
    useState<ProviderApiKeyMap>(providerApiKeys);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  const canSubmit = useMemo(() => {
    return Boolean(draft.trim()) && !loading;
  }, [draft, loading]);

  const modelOptions = WORKFLOW_MODEL_OPTIONS_BY_PROVIDER[provider];

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

    const result = await onSubmit(
      prompt,
      model,
      provider,
      providerApiKeys[provider] || undefined
    );

    setMessages((current) => [
      ...current,
      createMessage("assistant", result.message),
    ]);
  }, [draft, loading, model, onSubmit, provider, providerApiKeys]);

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
    setSettingsProviderApiKeys(providerApiKeys);
    setSettingsOpen(true);
  }, [provider, providerApiKeys]);

  const handleProviderChange = useCallback((nextProvider: WorkflowProvider) => {
    setProvider(nextProvider);
    setModel((currentModel) => getModelForProvider(nextProvider, currentModel));
    localStorage.setItem(LLM_PROVIDER_STORAGE_KEY, nextProvider);
  }, []);

  const handleSaveSettings = useCallback(() => {
    const nextProviderApiKeys = {
      ...settingsProviderApiKeys,
      [settingsProvider]: settingsProviderApiKeys[settingsProvider].trim(),
    };

    setProviderApiKeys(nextProviderApiKeys);
    localStorage.setItem(
      LLM_PROVIDER_API_KEYS_STORAGE_KEY,
      JSON.stringify(nextProviderApiKeys)
    );

    handleProviderChange(settingsProvider);
    setSettingsOpen(false);
  }, [handleProviderChange, settingsProvider, settingsProviderApiKeys]);

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
            </TooltipProvider>
            <TooltipProvider delayDuration={100}>
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
              <div
                key={message.id}
                className={`flex gap-2 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {message.role === "assistant" ? (
                  <div className="max-w-[92%] px-1 py-1 text-sm">
                    <p className="whitespace-pre-wrap leading-relaxed text-foreground">
                      {message.content}
                    </p>
                  </div>
                ) : (
                  <div className="max-w-[92%] rounded-2xl bg-muted px-3 py-2 text-sm text-foreground">
                    <p className="whitespace-pre-wrap leading-relaxed">
                      {message.content}
                    </p>
                  </div>
                )}
              </div>
            ))}

            {loading ? (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                  Generating workflow...
                </div>
              </div>
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
              placeholder="Ask Codex to create or refine your workflow..."
              value={draft}
            />

            <InputGroupAddon align="block-end" className="justify-between gap-1">
              <PromptInputSelect
                value={model}
                onValueChange={(value) =>
                  setModel(value as WorkflowGenerationModel)
                }
              >
                <PromptInputSelectTrigger
                  className="h-8 w-[190px] rounded-full bg-muted text-xs text-foreground hover:bg-accent"
                  disabled={loading}
                >
                  <PromptInputSelectValue />
                </PromptInputSelectTrigger>

                <PromptInputSelectContent>
                  {modelOptions.map((option) => (
                    <PromptInputSelectItem key={option.value} value={option.value}>
                      {option.label}
                    </PromptInputSelectItem>
                  ))}
                </PromptInputSelectContent>
              </PromptInputSelect>

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
        </form>
      </section>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>LLM Settings</SheetTitle>
            <SheetDescription>
              Choose provider and configure the API key for that provider.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="llm-provider">API provider</Label>
              <PromptInputSelect
                value={settingsProvider}
                onValueChange={(value) =>
                  setSettingsProvider(value as WorkflowProvider)
                }
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
              <Label htmlFor="llm-api-key">
                {WORKFLOW_PROVIDER_OPTIONS.find((candidate) => candidate.value === settingsProvider)
                  ?.label || "Provider"}{" "}
                API key
              </Label>
              <Input
                id="llm-api-key"
                type="password"
                value={settingsProviderApiKeys[settingsProvider]}
                onChange={(event) => {
                  const nextValue = event.currentTarget.value;

                  setSettingsProviderApiKeys((current) => ({
                    ...current,
                    [settingsProvider]: nextValue,
                  }));
                }}
                placeholder={
                  settingsProvider === "openai"
                    ? "sk-..."
                    : settingsProvider === "claude"
                      ? "sk-ant-..."
                      : settingsProvider === "groq"
                        ? "gsk_..."
                        : "Optional for local Ollama"
                }
              />
              <p className="text-xs text-muted-foreground">
                Stored locally in this browser and sent only to your workflow generation API route.
              </p>
            </div>

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
