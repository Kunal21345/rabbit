import type { CanvasEdgeComponentProps } from "@/components/ai-elements/canvas";

function buildBezierPath({
  sourceX,
  sourceY,
  targetX,
  targetY,
}: Pick<
  CanvasEdgeComponentProps,
  "sourceX" | "sourceY" | "targetX" | "targetY"
>) {
  const curve = Math.max(Math.abs(targetX - sourceX) * 0.4, 60);

  return `M ${sourceX} ${sourceY} C ${sourceX + curve} ${sourceY}, ${targetX - curve} ${targetY}, ${targetX} ${targetY}`;
}

const BaseEdge = (props: CanvasEdgeComponentProps) => {
  const path = buildBezierPath(props);

  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeOpacity={props.selected ? 0.95 : 0.65}
        strokeWidth={props.selected ? 2.4 : 1.8}
      />
    </g>
  );
};

export const Edge = {
  Default: BaseEdge,
  Animated: BaseEdge,
  Temporary: BaseEdge,
};
