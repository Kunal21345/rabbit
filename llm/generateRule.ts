export async function generateRule(
  businessRule: string
) {
  await new Promise((r) =>
    setTimeout(r, 800)
  );

  return {
    ruleDefinition:
      "return payload.income >= 50000 ? 'YES' : 'NO';",

    testCases:
    `income=50001 → YES
income=50000 → YES
income=49999 → NO
    `,
  };
}