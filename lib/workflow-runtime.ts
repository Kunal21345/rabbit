export type RuleResult = "YES" | "NO" | "ERROR";

/* -------------------------------------------------- */
/* Execute generated node rule */
/* -------------------------------------------------- */

export function executeRule(
  ruleDefinition: string,
  payload: Record<string, unknown>
): RuleResult {
  if (!ruleDefinition.trim()) {
    return "ERROR";
  }

  try {
    const runner = new Function(
      "payload",
      `
        "use strict";
        ${ruleDefinition}
      `
    );

    const result = runner(payload);

    if (result === "YES" || result === "NO") {
      return result;
    }

    return "ERROR";
  } catch (error) {
    console.error("Rule execution failed", error);

    return "ERROR";
  }
}

/* -------------------------------------------------- */
/* Route next node */
/* -------------------------------------------------- */

export function resolveNextNode(
  result: RuleResult,
  yesNextNodeId?: string,
  noNextNodeId?: string
) {
  if (result === "YES") {
    return yesNextNodeId || null;
  }

  if (result === "NO") {
    return noNextNodeId || null;
  }

  return null;
}