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

function EdgeLabel({
  label,
  sourceX,
  sourceY,
  targetX,
  targetY,
}: CanvasEdgeComponentProps) {
  if (!label) return null;

  const labelX = (sourceX + targetX) / 2;
  const labelY = (sourceY + targetY) / 2;

  return (
    <g>
      <rect
        fill="var(--background)"
        height="22"
        rx="10"
        stroke="currentColor"
        strokeOpacity="0.18"
        strokeWidth="1"
        width={Math.max(28, label.length * 9)}
        x={labelX - Math.max(14, (label.length * 9) / 2)}
        y={labelY - 11}
      />
      <text
        dominantBaseline="middle"
        fill="currentColor"
        fontSize="11"
        fontWeight="600"
        textAnchor="middle"
        x={labelX}
        y={labelY}
      >
        {label}
      </text>
    </g>
  );
}

const Temporary = (props: CanvasEdgeComponentProps) => {
  const path = buildBezierPath(props);

  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeDasharray="6 6"
        strokeOpacity={props.selected ? 0.9 : 0.45}
        strokeWidth={props.selected ? 2.2 : 1.5}
      />
      <EdgeLabel {...props} />
    </g>
  );
};

const Animated = (props: CanvasEdgeComponentProps) => {
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
      <EdgeLabel {...props} />
    </g>
  );
};

export const Edge = {
  Animated,
  Temporary,
};
