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
import { ArrowUpIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
} from "@/components/ai-elements/prompt-input";
import type { WorkflowGenerationModel } from "@/lib/workflow-generation";

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
    model: WorkflowGenerationModel
  ) => Promise<SubmitResult>;
};

const MODELS: Array<{
  label: string;
  value: WorkflowGenerationModel;
}> = [
  {
    label: "GPT OSS 20B",
    value: "openai/gpt-oss-20b",
  },
  {
    label: "GPT OSS 120B",
    value: "openai/gpt-oss-120b",
  },
  {
    label: "Llama 3.3 70B",
    value: "llama-3.3-70b-versatile",
  },
];

function createMessage(
  role: ChatRole,
  content: string
): ChatMessage {
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
  const [model, setModel] =
    useState<WorkflowGenerationModel>("openai/gpt-oss-120b");
  const [messages, setMessages] = useState<ChatMessage[]>([
    INITIAL_MESSAGE,
  ]);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  const canSubmit = useMemo(() => {
    return Boolean(draft.trim()) && !loading;
  }, [draft, loading]);

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
    setMessages((current) => [
      ...current,
      createMessage("user", prompt),
    ]);

    const result = await onSubmit(prompt, model);

    setMessages((current) => [
      ...current,
      createMessage("assistant", result.message),
    ]);
  }, [draft, loading, model, onSubmit]);

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

  return (
    <div className="h-full w-full">
      <section className="flex h-full w-full flex-col overflow-hidden bg-background">
        <header className="flex h-11 items-center justify-between border-b border-border px-3">
          <div>
            <p className="text-xs font-semibold tracking-wide text-foreground">
              Workflow Chatbot
            </p>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={handleResetChat}
            disabled={loading}
            className="rounded-sm"
          >
            <Plus data-icon="inline-start" />
            New chat
          </Button>
        </header>

        <ScrollArea ref={scrollAreaRef} className="min-h-0 flex-1">
          <div className="space-y-4 px-4 py-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-2 ${
                  message.role === "user"
                    ? "justify-end"
                    : "justify-start"
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
                  {MODELS.map((option) => (
                    <PromptInputSelectItem key={option.value} value={option.value}>
                      {option.label}
                    </PromptInputSelectItem>
                  ))}
                </PromptInputSelectContent>
              </PromptInputSelect>

              <InputGroupButton
                aria-label="Send"
                type="submit"
                size="icon-sm"
                className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={!canSubmit}
              >
                <ArrowUpIcon />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>

          {error ? (
            <p className="mt-2 text-xs text-destructive">{error}</p>
          ) : null}
        </form>
      </section>
    </div>
  );
}
