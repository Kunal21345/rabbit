"use client";

import {
  ReactFlow,
  Background,
  type ReactFlowProps,
  type Node,
  type Edge,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";

const deleteKeyCode = ["Backspace", "Delete"];
export function Canvas<
  N extends Node = Node,
  E extends Edge = Edge
>(props: ReactFlowProps<N, E>) {
  return (
    <div style={{ width: "100%", height: "100%" }}>
    <ReactFlow<N, E>
      deleteKeyCode={deleteKeyCode}
      panOnDrag={false}
      panOnScroll
      selectionOnDrag
      zoomOnDoubleClick={false}
      {...props}
    >
      <Background bgColor="var(--background)" />
      {props.children}
    </ReactFlow>
    </div>
  );
}