"use client";

import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTheme } from "next-themes";

type NodePosition = {
  x: number;
  y: number;
};

export type CanvasNode<TData = Record<string, unknown>> = {
  id: string;
  type: string;
  position: NodePosition;
  data: TData;
};

export type CanvasEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: string;
};

export type CanvasNodeComponentProps<TData = Record<string, unknown>> = {
  data: TData;
  selected?: boolean;
};

export type CanvasEdgeComponentProps = {
  id: string;
  label?: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  selected?: boolean;
};

type NodeTypes<TData> = Record<
  string,
  (props: CanvasNodeComponentProps<TData>) => ReactNode
>;

type EdgeTypes = Record<
  string,
  (props: CanvasEdgeComponentProps) => ReactNode
>;

type CanvasProps<N extends CanvasNode = CanvasNode, E extends CanvasEdge = CanvasEdge> = {
  nodes: N[];
  edges: E[];
  nodeTypes: NodeTypes<N["data"]>;
  edgeTypes?: EdgeTypes;
  fitView?: boolean;
  style?: CSSProperties;
  className?: string;
  colorMode?: "light" | "dark";
  children?: ReactNode;
  onNodeClick?: (
    event: ReactMouseEvent<HTMLDivElement>,
    node: N
  ) => void;
  onNodePositionChange?: (
    nodeId: string,
    position: NodePosition
  ) => void;
};

type Viewport = {
  x: number;
  y: number;
  zoom: number;
};

type MeasuredNode = {
  width: number;
  height: number;
};

const DEFAULT_NODE_SIZE: MeasuredNode = {
  width: 320,
  height: 144,
};

const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.6;
const ZOOM_TRANSITION_MS = 140;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getBezierPath({
  sourceX,
  sourceY,
  targetX,
  targetY,
}: {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}) {
  const curve = Math.max(Math.abs(targetX - sourceX) * 0.4, 60);

  return `M ${sourceX} ${sourceY} C ${sourceX + curve} ${sourceY}, ${targetX - curve} ${targetY}, ${targetX} ${targetY}`;
}

function getBounds<N extends CanvasNode>(
  nodes: N[],
  measurements: Map<string, MeasuredNode>
) {
  if (nodes.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: DEFAULT_NODE_SIZE.width,
      maxY: DEFAULT_NODE_SIZE.height,
    };
  }

  return nodes.reduce(
    (acc, node) => {
      const size = measurements.get(node.id) || DEFAULT_NODE_SIZE;

      return {
        minX: Math.min(acc.minX, node.position.x),
        minY: Math.min(acc.minY, node.position.y),
        maxX: Math.max(acc.maxX, node.position.x + size.width),
        maxY: Math.max(acc.maxY, node.position.y + size.height),
      };
    },
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    }
  );
}

export function Canvas<
  N extends CanvasNode = CanvasNode,
  E extends CanvasEdge = CanvasEdge
>({
  nodes,
  edges,
  nodeTypes,
  edgeTypes = {},
  fitView = false,
  style,
  className,
  colorMode = "light",
  children,
  onNodeClick,
  onNodePositionChange,
}: CanvasProps<N, E>) {
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef<string | null>(null);
  const [themeReady, setThemeReady] = useState(false);
  const pointerStateRef = useRef<
    | {
        mode: "pan";
        pointerId: number;
        startClientX: number;
        startClientY: number;
        startViewport: Viewport;
      }
    | {
        mode: "drag";
        pointerId: number;
        nodeId: string;
        startClientX: number;
        startClientY: number;
        startPosition: NodePosition;
        moved: boolean;
      }
    | null
  >(null);
  const zoomTransitionTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const [viewport, setViewport] = useState<Viewport>({
    x: 80,
    y: 80,
    zoom: 1,
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [viewportLocked, setViewportLocked] = useState(false);
  const [isZoomTransitioning, setIsZoomTransitioning] =
    useState(false);
  const [containerSize, setContainerSize] = useState({
    width: 0,
    height: 0,
  });
  const [measurements, setMeasurements] = useState<Map<string, MeasuredNode>>(
    () => new Map()
  );

  useLayoutEffect(() => {
    const element = containerRef.current;

    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      setContainerSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const registerNode = useCallback((nodeId: string, element: HTMLDivElement | null) => {
    if (!element) return;

    const updateSize = () => {
      const nextSize = {
        width: element.offsetWidth || DEFAULT_NODE_SIZE.width,
        height: element.offsetHeight || DEFAULT_NODE_SIZE.height,
      };

      setMeasurements((prev) => {
        const current = prev.get(nodeId);
        if (
          current &&
          current.width === nextSize.width &&
          current.height === nextSize.height
        ) {
          return prev;
        }

        const next = new Map(prev);
        next.set(nodeId, nextSize);
        return next;
      });
    };

    updateSize();

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(element);
  }, []);

  const autoViewport = useMemo(() => {
    if (!containerSize.width || !containerSize.height || nodes.length === 0) {
      return viewport;
    }

    const bounds = getBounds(nodes, measurements);
    const padding = 80;
    const graphWidth = Math.max(bounds.maxX - bounds.minX, 1);
    const graphHeight = Math.max(bounds.maxY - bounds.minY, 1);
    const zoom = clamp(
      Math.min(
        (containerSize.width - padding * 2) / graphWidth,
        (containerSize.height - padding * 2) / graphHeight
      ),
      MIN_ZOOM,
      MAX_ZOOM
    );

    return {
      x:
        (containerSize.width - graphWidth * zoom) / 2 -
        bounds.minX * zoom,
      y:
        (containerSize.height - graphHeight * zoom) / 2 -
        bounds.minY * zoom,
      zoom,
    };
  }, [
    containerSize.height,
    containerSize.width,
    measurements,
    nodes,
    viewport,
  ]);

  const activeViewport =
    fitView && !viewportLocked ? autoViewport : viewport;

  useEffect(() => {
    setThemeReady(true);
  }, []);

  const activeColorMode =
    themeReady &&
    (resolvedTheme === "dark" || resolvedTheme === "light")
      ? resolvedTheme
      : colorMode;

  const edgeGeometry = useMemo(() => {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));

    return edges
      .map((edge) => {
        const sourceNode = nodeMap.get(edge.source);
        const targetNode = nodeMap.get(edge.target);

        if (!sourceNode || !targetNode) return null;

        const sourceSize =
          measurements.get(sourceNode.id) || DEFAULT_NODE_SIZE;
        const targetSize =
          measurements.get(targetNode.id) || DEFAULT_NODE_SIZE;

        return {
          edge,
          sourceX: sourceNode.position.x + sourceSize.width,
          sourceY: sourceNode.position.y + sourceSize.height / 2,
          targetX: targetNode.position.x,
          targetY: targetNode.position.y + targetSize.height / 2,
        };
      })
      .filter(Boolean) as Array<{
      edge: E;
      sourceX: number;
      sourceY: number;
      targetX: number;
      targetY: number;
    }>;
  }, [edges, measurements, nodes]);

  const handleBackgroundPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;

      pointerStateRef.current = {
        mode: "pan",
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startViewport: activeViewport,
      };

      setViewportLocked(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [activeViewport]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const pointerState = pointerStateRef.current;

      if (!pointerState || pointerState.pointerId !== event.pointerId) {
        return;
      }

      if (pointerState.mode === "pan") {
        setViewport({
          ...pointerState.startViewport,
          x:
            pointerState.startViewport.x +
            (event.clientX - pointerState.startClientX),
          y:
            pointerState.startViewport.y +
            (event.clientY - pointerState.startClientY),
          zoom: pointerState.startViewport.zoom,
        });
        return;
      }

      const deltaX =
        (event.clientX - pointerState.startClientX) /
        activeViewport.zoom;
      const deltaY = (event.clientY - pointerState.startClientY) / activeViewport.zoom;

      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        pointerStateRef.current = {
          ...pointerState,
          moved: true,
        };
      }

      onNodePositionChange?.(pointerState.nodeId, {
        x: pointerState.startPosition.x + deltaX,
        y: pointerState.startPosition.y + deltaY,
      });
    },
    [activeViewport.zoom, onNodePositionChange]
  );

  const clearPointerState = useCallback(() => {
    pointerStateRef.current = null;
  }, []);

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const pointerState = pointerStateRef.current;

      if (!pointerState || pointerState.pointerId !== event.pointerId) {
        return;
      }

      if (pointerState.mode === "drag" && pointerState.moved) {
        suppressClickRef.current = pointerState.nodeId;
      }

      event.currentTarget.releasePointerCapture(event.pointerId);
      clearPointerState();
    },
    [clearPointerState]
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      event.preventDefault();

      const element = containerRef.current;
      if (!element) return;

      const zoomFactor = event.deltaY > 0 ? 0.92 : 1.08;

      setViewportLocked(true);
      setIsZoomTransitioning(true);

      if (zoomTransitionTimeoutRef.current) {
        clearTimeout(zoomTransitionTimeoutRef.current);
      }

      zoomTransitionTimeoutRef.current = setTimeout(() => {
        setIsZoomTransitioning(false);
        zoomTransitionTimeoutRef.current = null;
      }, ZOOM_TRANSITION_MS);

      setViewport((current) => {
        const baseViewport = viewportLocked ? current : activeViewport;
        const nextZoom = clamp(
          baseViewport.zoom * zoomFactor,
          MIN_ZOOM,
          MAX_ZOOM
        );
        const centerX = element.clientWidth / 2;
        const centerY = element.clientHeight / 2;
        const worldX =
          (centerX - baseViewport.x) / baseViewport.zoom;
        const worldY =
          (centerY - baseViewport.y) / baseViewport.zoom;

        return {
          x: centerX - worldX * nextZoom,
          y: centerY - worldY * nextZoom,
          zoom: nextZoom,
        };
      });
    },
    [activeViewport, viewportLocked]
  );

  useEffect(() => {
    return () => {
      if (zoomTransitionTimeoutRef.current) {
        clearTimeout(zoomTransitionTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      onPointerDown={handleBackgroundPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        position: "relative",
        backgroundColor:
          activeColorMode === "dark"
            ? "hsl(222 18% 8%)"
            : "hsl(210 40% 98%)",
        touchAction: "none",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translate(${activeViewport.x}px, ${activeViewport.y}px) scale(${activeViewport.zoom})`,
          transformOrigin: "0 0",
          willChange: "transform",
          transition: isZoomTransitioning
            ? `transform ${ZOOM_TRANSITION_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`
            : "none",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: -4000,
            top: -4000,
            width: 8000,
            height: 8000,
            pointerEvents: "none",
            backgroundColor:
              activeColorMode === "dark"
                ? "hsl(222 18% 8%)"
                : "hsl(210 40% 98%)",
            backgroundImage:
              activeColorMode === "dark"
                ? [
                    "radial-gradient(circle at center, rgba(255,255,255,0.12) 0 1.2px, transparent 1.3px)",
                    "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0))",
                  ].join(", ")
                : [
                    "radial-gradient(circle at center, rgba(15,23,42,0.14) 0 1.2px, transparent 1.3px)",
                    "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(248,250,252,0.96))",
                  ].join(", "),
            backgroundRepeat: "repeat, no-repeat",
            backgroundPosition: "0 0, 0 0",
            backgroundSize: "22px 22px, 100% 100%",
          }}
        />
        <svg
          width="100%"
          height="100%"
          style={{
            position: "absolute",
            inset: 0,
            overflow: "visible",
            pointerEvents: "none",
          }}
        >
          {edgeGeometry.map(({ edge, sourceX, sourceY, targetX, targetY }) => {
            const EdgeComponent = edgeTypes[edge.type || "animated"];

            if (EdgeComponent) {
              return (
                <EdgeComponent
                  id={edge.id}
                  key={edge.id}
                  label={edge.label}
                  sourceX={sourceX}
                  sourceY={sourceY}
                  targetX={targetX}
                  targetY={targetY}
                />
              );
            }

            const path = getBezierPath({
              sourceX,
              sourceY,
              targetX,
              targetY,
            });

            return (
              <path
                key={edge.id}
                d={path}
                fill="none"
                stroke="currentColor"
                strokeOpacity={0.35}
                strokeWidth={1.5}
              />
            );
          })}
        </svg>

        {nodes.map((node) => {
          const NodeComponent = nodeTypes[node.type];
          if (!NodeComponent) return null;

          return (
            <div
              key={node.id}
              ref={(element) => registerNode(node.id, element)}
              onPointerDown={(event) => {
                event.stopPropagation();

                pointerStateRef.current = {
                  mode: "drag",
                  pointerId: event.pointerId,
                  nodeId: node.id,
                  startClientX: event.clientX,
                  startClientY: event.clientY,
                  startPosition: node.position,
                  moved: false,
                };

                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onClick={(event) => {
                if (suppressClickRef.current === node.id) {
                  suppressClickRef.current = null;
                  return;
                }

                setSelectedNodeId(node.id);
                onNodeClick?.(event, node);
              }}
              style={{
                position: "absolute",
                left: node.position.x,
                top: node.position.y,
                cursor: "grab",
                willChange: "transform",
              }}
            >
              <NodeComponent
                data={node.data}
                selected={selectedNodeId === node.id}
              />
            </div>
          );
        })}

        {children}
      </div>
    </div>
  );
}
