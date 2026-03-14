"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

import { generateRule } from "@/llm/generateRule";

import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/* -------------------------------------------------- */
/* Types */
/* -------------------------------------------------- */

type NodeData = {
  id: string;
  label: string;
  description: string;
  businessRule: string;
  aiRuleDefinition: string;
  aiTestRules: string;
  comments: string;
  yesCondition: string;
  yesNextNodeId: string;
  noCondition: string;
  noNextNodeId: string;
};

type NodeSheetProps = {
  node: NodeData | null;
  open: boolean;
  onClose: () => void;
  onSave: (node: NodeData) => void;
  nodes: {
    id: string;
    label: string;
  }[];
};

type FieldSchema = {
  key: keyof NodeData;
  label: string;
  type: "textarea" | "input";
};

/* -------------------------------------------------- */
/* Schema */
/* -------------------------------------------------- */

const MAIN_FIELDS: FieldSchema[] = [
  {
    key: "description",
    label: "Question Description",
    type: "textarea",
  },
  {
    key: "businessRule",
    label: "Business Logic",
    type: "textarea",
  },
  {
    key: "aiRuleDefinition",
    label: "Rule Definition (AI Generated)",
    type: "textarea",
  },
  {
    key: "aiTestRules",
    label: "Test Cases (AI Generated)",
    type: "textarea",
  },
];

const FOOTER_FIELDS: FieldSchema[] = [
  {
    key: "comments",
    label: "Comments",
    type: "textarea",
  },
];

const FIELD_CLASS =
  "border border-border bg-background shadow-none";

/* -------------------------------------------------- */
/* Component */
/* -------------------------------------------------- */

export function NodeSheet({
  node,
  open,
  onClose,
  onSave,
  nodes,
}: NodeSheetProps) {
  const [draft, setDraft] = useState<NodeData | null>(null);

  const [generating, setGenerating] =
    useState(false);

  /* -------------------------------------------------- */
  /* Sync */
  /* -------------------------------------------------- */

  useEffect(() => {
    if (!node) {
      setDraft(null);
      return;
    }

    setDraft({
      ...node,
      yesCondition: "YES",
      noCondition: "NO",
    });
  }, [node]);

  /* -------------------------------------------------- */
  /* Autosave */
  /* -------------------------------------------------- */

  useEffect(() => {
    if (!draft) return;

    const timer = setTimeout(() => {
      onSave(draft);
    }, 500);

    return () => clearTimeout(timer);
  }, [draft, onSave]);

  /* -------------------------------------------------- */
  /* Update */
  /* -------------------------------------------------- */

  const updateField = useCallback(
    (key: keyof NodeData, value: string) => {
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              [key]: value,
            }
          : prev
      );
    },
    []
  );

  /* -------------------------------------------------- */
  /* Generate AI */
  /* -------------------------------------------------- */

  const handleGenerate = useCallback(async () => {
    if (!draft?.businessRule.trim()) return;

    setGenerating(true);

    try {
      const result = await generateRule(
        draft.businessRule
      );

      setDraft((prev) =>
        prev
          ? {
              ...prev,
              aiRuleDefinition:
                result.ruleDefinition,
              aiTestRules:
                result.testCases,
            }
          : prev
      );
    } finally {
      setGenerating(false);
    }
  }, [draft]);

  /* -------------------------------------------------- */
  /* Options */
  /* -------------------------------------------------- */

  const yesOptions = useMemo(() => {
    if (!draft) return [];

    return nodes.filter(
      (n) =>
        n.id !== draft.id &&
        n.id !== "start" &&
        n.id !== draft.noNextNodeId
    );
  }, [nodes, draft]);

  const noOptions = useMemo(() => {
    if (!draft) return [];

    return nodes.filter(
      (n) =>
        n.id !== draft.id &&
        n.id !== "start" &&
        n.id !== draft.yesNextNodeId
    );
  }, [nodes, draft]);

  /* -------------------------------------------------- */

  if (!draft) return null;

  /* -------------------------------------------------- */

  const renderField = (field: FieldSchema) => {
    const id = field.key;

    const isGenerated =
      field.key === "aiRuleDefinition" ||
      field.key === "aiTestRules";

    return (
      <div className="grid gap-3" key={field.key}>
        <Label htmlFor={id}>{field.label}</Label>

        {field.type === "textarea" ? (
          <Textarea
            id={id}
            name={id}
            className={
              isGenerated
                ? "border border-border bg-muted"
                : FIELD_CLASS
            }
            value={draft[field.key]}
            onChange={(e) =>
              updateField(field.key, e.target.value)
            }
          />
        ) : (
          <Input
            id={id}
            name={id}
            className={FIELD_CLASS}
            value={draft[field.key]}
            onChange={(e) =>
              updateField(field.key, e.target.value)
            }
          />
        )}

        {field.key === "businessRule" && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-3 py-2 text-sm border rounded"
          >
            {generating
              ? "Generating..."
              : "Generate AI"}
          </button>
        )}
      </div>
    );
  };

  /* -------------------------------------------------- */

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader className="border-b pb-4">
          <SheetTitle className="font-bold uppercase">
            {draft.label}
          </SheetTitle>

          <SheetDescription>
            Configure node logic
          </SheetDescription>
        </SheetHeader>

        {/* Main */}

        <div className="grid gap-6 p-6 border-b">
          {MAIN_FIELDS.map(renderField)}
        </div>

        {/* YES / NO */}

        <div className="grid gap-6 p-6 border-b">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-3">
              <Label htmlFor="yesCondition">
                YES Condition
              </Label>

              <Input
                id="yesCondition"
                value="YES"
                disabled
                className="border border-border bg-muted"
              />
            </div>

            <div className="grid gap-3">
              <Label htmlFor="yesNextNodeId">
                YES Target
              </Label>

              <Select
                value={draft.yesNextNodeId}
                onValueChange={(value) =>
                  updateField("yesNextNodeId", value)
                }
              >
                <SelectTrigger
                  id="yesNextNodeId"
                  className={FIELD_CLASS}
                >
                  <SelectValue placeholder="Select node" />
                </SelectTrigger>

                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Nodes</SelectLabel>

                    {yesOptions.map((n) => (
                      <SelectItem
                        key={n.id}
                        value={n.id}
                      >
                        {n.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-3">
              <Label htmlFor="noCondition">
                NO Condition
              </Label>

              <Input
                id="noCondition"
                value="NO"
                disabled
                className="border border-border bg-muted"
              />
            </div>

            <div className="grid gap-3">
              <Label htmlFor="noNextNodeId">
                NO Target
              </Label>

              <Select
                value={draft.noNextNodeId}
                onValueChange={(value) =>
                  updateField("noNextNodeId", value)
                }
              >
                <SelectTrigger
                  id="noNextNodeId"
                  className={FIELD_CLASS}
                >
                  <SelectValue placeholder="Select node" />
                </SelectTrigger>

                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Nodes</SelectLabel>

                    {noOptions.map((n) => (
                      <SelectItem
                        key={n.id}
                        value={n.id}
                      >
                        {n.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Footer */}

        <div className="grid gap-6 p-6">
          {FOOTER_FIELDS.map(renderField)}
        </div>
      </SheetContent>
    </Sheet>
  );
}