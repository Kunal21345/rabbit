"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";

import { generateRule } from "@/llm/generateRule";

import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

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
  nextNodeIds: string[];
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

type EditableNodeField = Exclude<
  keyof NodeData,
  "id" | "label" | "nextNodeIds"
>;

type FieldSchema = {
  key: EditableNodeField;
  label: string;
  type: "textarea" | "input";
};

function areNodeDraftsEqual(
  left: NodeData | null,
  right: NodeData | null
) {
  if (!left || !right) return left === right;

  return (
    left.id === right.id &&
    left.label === right.label &&
    left.description === right.description &&
    left.businessRule === right.businessRule &&
    left.aiRuleDefinition === right.aiRuleDefinition &&
    left.aiTestRules === right.aiTestRules &&
    left.comments === right.comments &&
    left.nextNodeIds.length === right.nextNodeIds.length &&
    left.nextNodeIds.every(
      (nodeId, index) => nodeId === right.nextNodeIds[index]
    )
  );
}

/* -------------------------------------------------- */
/* Schema */
/* -------------------------------------------------- */

const MAIN_FIELDS: FieldSchema[] = [
  {
    key: "description",
    label: "Step Description",
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
  "bg-background shadow-none";

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
  const lastSavedDraftRef = useRef<NodeData | null>(null);

  const [generating, setGenerating] =
    useState(false);

  /* -------------------------------------------------- */
  /* Sync */
  /* -------------------------------------------------- */

  useEffect(() => {
    if (!node) {
      setDraft(null);
      lastSavedDraftRef.current = null;
      return;
    }

    lastSavedDraftRef.current = node;
    setDraft((current) =>
      areNodeDraftsEqual(current, node) ? current : node
    );
  }, [node]);

  /* -------------------------------------------------- */
  /* Autosave */
  /* -------------------------------------------------- */

  useEffect(() => {
    if (!draft) return;
    if (areNodeDraftsEqual(lastSavedDraftRef.current, draft)) {
      return;
    }

    const timer = setTimeout(() => {
      onSave(draft);
      lastSavedDraftRef.current = draft;
    }, 500);

    return () => clearTimeout(timer);
  }, [draft, onSave]);

  /* -------------------------------------------------- */
  /* Update */
  /* -------------------------------------------------- */

  const updateField = useCallback(
    (key: EditableNodeField, value: string) => {
      setDraft((prev) =>
        prev
          ? prev[key] === value
            ? prev
            : {
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

  const nextTargetLabels = useMemo(() => {
    if (!draft) return [];

    const labelMap = new Map(
      nodes.map((node) => [node.id, node.label])
    );

    return draft.nextNodeIds.map(
      (nodeId) => labelMap.get(nodeId) || nodeId
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
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            variant="secondary"
            size="sm"
            className="w-fit"
          >
            {generating
              ? "Generating..."
              : "Generate AI"}
          </Button>
        )}
      </div>
    );
  };

  /* -------------------------------------------------- */

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-bold uppercase">
            {draft.label}
          </SheetTitle>

          <SheetDescription>
            Configure node logic
          </SheetDescription>
        </SheetHeader>
        <Separator />

        {/* Main */}

        <div className="grid gap-6 p-6">
          {MAIN_FIELDS.map(renderField)}
        </div>
        <Separator />

        {/* Next Steps */}

        <div className="grid gap-6 p-6">
          <div className="grid gap-3">
            <Label>Connected Targets</Label>

            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              {nextTargetLabels.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {nextTargetLabels.map((label) => (
                    <p key={label}>{label}</p>
                  ))}
                </div>
              ) : (
                <p>No outgoing connections</p>
              )}
            </div>
          </div>
        </div>
        <Separator />

        {/* Footer */}

        <div className="grid gap-6 p-6">
          {FOOTER_FIELDS.map(renderField)}
        </div>
      </SheetContent>
    </Sheet>
  );
}
