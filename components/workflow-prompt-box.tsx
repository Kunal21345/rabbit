"use client";

import {
  useCallback,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUpIcon } from "lucide-react";
import type { WorkflowGenerationModel } from "@/lib/workflow-generation";

type WorkflowPromptBoxProps = {
  loading?: boolean;
  onSubmit: (
    prompt: string,
    model: WorkflowGenerationModel
  ) => void;
  error?: string | null;
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

export function WorkflowPromptBox({
  loading = false,
  onSubmit,
  error,
}: WorkflowPromptBoxProps) {
  const [draft, setDraft] = useState("");
  const [model, setModel] =
    useState<WorkflowGenerationModel>(
      "openai/gpt-oss-120b"
    );

  const submitPrompt = useCallback(() => {
    const prompt = draft.trim();

    if (!prompt || loading) return;

    onSubmit(prompt, model);
  }, [draft, loading, model, onSubmit]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      submitPrompt();
    },
    [submitPrompt]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submitPrompt();
      }
    },
    [submitPrompt]
  );

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-4 sm:px-6 sm:pb-6">
      <div className="pointer-events-auto w-full max-w-3xl">
        <form
          className="overflow-hidden rounded-[28px] border border-border/70 shadow-2xl shadow-black/10 backdrop-blur-xl"
          onSubmit={handleSubmit}
        >
          <Textarea
            className="min-h-[50px] rounded-none border-0 px-4 py-4 text-sm shadow-none focus-visible:ring-0 sm:px-5"
            disabled={loading}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the workflow use case you want to generate..."
            value={draft}
          />

          <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <Select
              value={model}
              onValueChange={(value) =>
                setModel(value as WorkflowGenerationModel)
              }
            >
                <SelectTrigger
                  className="h-8 w-[178px] rounded-full bg-none text-xs shadow-none"
                  disabled={loading}
                >
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  {MODELS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
            </Select>

            {error ? (
              <p className="min-w-0 flex-1 truncate text-xs text-destructive">
                {error}
              </p>
            ) : null}

            <Button
              className="ml-auto rounded-full"
              disabled={!draft.trim() || loading}
              size="icon-sm"
              type="submit"
            >
              <ArrowUpIcon className="size-4" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
