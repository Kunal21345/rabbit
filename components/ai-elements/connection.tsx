const HALF = 0.5;

type ConnectionProps = {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

export const Connection = ({
  fromX,
  fromY,
  toX,
  toY,
}: ConnectionProps) => (
  <g>
    <path
      className="animated"
      d={`M${fromX},${fromY} C ${fromX + (toX - fromX) * HALF},${fromY} ${fromX + (toX - fromX) * HALF},${toY} ${toX},${toY}`}
      fill="none"
      stroke="var(--color-ring)"
      strokeWidth={1}
    />
    <circle
      cx={toX}
      cy={toY}
      fill="#fff"
      r={3}
      stroke="var(--color-ring)"
      strokeWidth={1}
    />
  </g>
);
