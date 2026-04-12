"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";

import { Label } from "@/components/ui/label";
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
  details: string;
  suggestions: string;
  nextNodeIds: string[];
};

type NodeSheetProps = {
  node: NodeData | null;
  open: boolean;
  onClose: () => void;
  onSave: (node: NodeData) => void;
  detailsLoading?: boolean;
  detailsError?: string | null;
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

/* -------------------------------------------------- */
/* Schema */
/* -------------------------------------------------- */

const MAIN_FIELDS: FieldSchema[] = [
  {
    key: "description",
    label: "Step description",
    type: "textarea",
  },
  {
    key: "details",
    label: "Step details",
    type: "textarea",
  },
  {
    key: "suggestions",
    label: "Suggestions for completion",
    type: "textarea",
  },
];

const FIELD_CLASS =
  "bg-background shadow-none font-normal text-muted-foreground";

/* -------------------------------------------------- */
/* Component */
/* -------------------------------------------------- */

export function NodeSheet({
  node,
  open,
  onClose,
  onSave,
  detailsLoading = false,
  detailsError = null,
  nodes,
}: NodeSheetProps) {
  const [overrides, setOverrides] = useState<
    Partial<Record<EditableNodeField, string>>
  >({});

  const draft = useMemo(() => {
    if (!node) {
      return null;
    }

    return {
      ...node,
      ...overrides,
    };
  }, [node, overrides]);

  /* -------------------------------------------------- */
  /* Autosave */
  /* -------------------------------------------------- */

  const hasOverrides = Object.keys(overrides).length > 0;

  useEffect(() => {
    if (!draft || !hasOverrides) {
      return;
    }

    const timer = setTimeout(() => {
      onSave(draft);
      setOverrides({});
    }, 500);

    return () => window.clearTimeout(timer);
  }, [draft, hasOverrides, onSave]);

  /* -------------------------------------------------- */
  /* Update */
  /* -------------------------------------------------- */

  const updateField = useCallback(
    (key: EditableNodeField, value: string) => {
      setOverrides((current) => {
        if (!draft) {
          return current;
        }

        const nextValue = value === node?.[key] ? undefined : value;

        if (current[key] === nextValue) {
          return current;
        }

        const nextOverrides = {
          ...current,
        };

        if (nextValue === undefined) {
          delete nextOverrides[key];
        } else {
          nextOverrides[key] = nextValue;
        }

        return nextOverrides;
      });
    },
    [draft, node]
  );

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

    return (
      <div className="grid gap-4" key={field.key}>
        <Label htmlFor={id}>{field.label}</Label>

        {field.type === "textarea" ? (
          <Textarea
            id={id}
            name={id}
            className={FIELD_CLASS}
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

        {field.key === "suggestions" ? (
          <p className="text-xs text-muted-foreground">
            Use this area for practical suggestions, prompts, or guidance needed to complete the step.
          </p>
        ) : null}
      </div>
    );
  };

  /* -------------------------------------------------- */

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-semibold text-xl">
            {draft.label}
          </SheetTitle>

          <SheetDescription className="text-sm text-muted-foreground">
            Step details and suggestions
          </SheetDescription>
        </SheetHeader>
        <Separator />

        {/* Main */}

        <div className="grid gap-6 p-6">
          {detailsLoading ? (
            <p className="text-sm text-muted-foreground">
              Generating step details...
            </p>
          ) : null}

          {detailsError ? (
            <p className="text-sm text-destructive">
              {detailsError}
            </p>
          ) : null}

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

      </SheetContent>
    </Sheet>
  );
}
