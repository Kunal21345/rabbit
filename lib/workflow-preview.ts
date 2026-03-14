export function previewWorkflow(
  nodes: unknown[],
  edges: unknown[]
) {
  const snapshot = {
    id: crypto.randomUUID(),
    version: Date.now(),
    previewedAt: new Date().toISOString(),
    nodes,
    edges,
  };

  localStorage.setItem(
    "workflow-preview",
    JSON.stringify(snapshot)
  );

  return snapshot;
}