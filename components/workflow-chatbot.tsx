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
import { BotIcon, RotateCcwIcon, SendIcon, UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-end p-3 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:p-0">
      <section className="pointer-events-auto w-full max-w-xl overflow-hidden rounded-2xl border border-border/70 bg-background/95 shadow-2xl backdrop-blur-md sm:w-[420px]">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Workflow Chatbot</p>
            <p className="text-xs text-muted-foreground">
              Ask for workflow generation or refinements.
            </p>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleResetChat}
            disabled={loading}
          >
            <RotateCcwIcon data-icon="inline-start" />
            New chat
          </Button>
        </header>

        <ScrollArea
          ref={scrollAreaRef}
          className="h-72 sm:h-80"
        >
          <div className="space-y-3 p-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-2 ${
                  message.role === "user"
                    ? "justify-end"
                    : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[86%] rounded-2xl px-3 py-2 text-sm ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-1 text-xs opacity-80">
                    {message.role === "assistant" ? (
                      <BotIcon />
                    ) : (
                      <UserIcon />
                    )}
                    <span>
                      {message.role === "assistant"
                        ? "Assistant"
                        : "You"}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {message.content}
                  </p>
                </div>
              </div>
            ))}

            {loading ? (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                  Generating workflow...
                </div>
              </div>
            ) : null}
          </div>
        </ScrollArea>

        <form className="border-t p-3" onSubmit={handleSubmit}>
          <Textarea
            className="min-h-[82px] resize-none"
            disabled={loading}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a workflow request..."
            value={draft}
          />

          <div className="mt-3 flex items-center gap-2">
            <Select
              value={model}
              onValueChange={(value) =>
                setModel(value as WorkflowGenerationModel)
              }
            >
              <SelectTrigger
                className="h-8 w-[190px] text-xs"
                disabled={loading}
              >
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                {MODELS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="submit"
              className="ml-auto"
              size="sm"
              disabled={!canSubmit}
            >
              <SendIcon data-icon="inline-end" />
              Send
            </Button>
          </div>

          {error ? (
            <p className="mt-2 text-xs text-destructive">{error}</p>
          ) : null}
        </form>
      </section>
    </div>
  );
}
