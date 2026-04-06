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
  useSyncExternalStore,
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
  backgroundColor?: string;
  children?: ReactNode;
  onNodeClick?: (
    event: ReactMouseEvent<HTMLDivElement>,
    node: N
  ) => void;
  onNodePositionChange?: (
    nodeId: string,
    position: NodePosition
  ) => void;
  onDeleteNodes?: (nodeIds: string[]) => void;
  onDeleteEdge?: (edgeId: string) => void;
  onConnect?: (connection: {
    source: string;
    target: string;
  }) => void;
  onReconnectEdgeTarget?: (
    edgeId: string,
    target: string
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
  backgroundColor,
  children,
  onNodeClick,
  onNodePositionChange,
  onDeleteNodes,
  onDeleteEdge,
  onConnect,
  onReconnectEdgeTarget,
}: CanvasProps<N, E>) {
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef<string | null>(null);
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
    | {
        mode: "select";
        pointerId: number;
        startClientX: number;
        startClientY: number;
        currentClientX: number;
        currentClientY: number;
      }
    | {
        mode: "connect";
        pointerId: number;
        sourceNodeId: string;
        startClientX: number;
        startClientY: number;
        currentClientX: number;
        currentClientY: number;
      }
    | {
        mode: "reconnect-edge";
        pointerId: number;
        edgeId: string;
        sourceNodeId: string;
        startClientX: number;
        startClientY: number;
        currentClientX: number;
        currentClientY: number;
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
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdgeId, setSelectedEdgeId] =
    useState<string | null>(null);
  const [viewportLocked, setViewportLocked] = useState(false);
  const [isZoomTransitioning, setIsZoomTransitioning] =
    useState(false);
  const [selectionRect, setSelectionRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [connectionPreview, setConnectionPreview] = useState<{
    sourceNodeId: string;
    edgeId?: string;
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
  } | null>(null);
  const [reconnectingEdgeId, setReconnectingEdgeId] =
    useState<string | null>(null);
  const [hoveredTargetNodeId, setHoveredTargetNodeId] =
    useState<string | null>(null);
  const [containerSize, setContainerSize] = useState({
    width: 0,
    height: 0,
  });
  const [measurements, setMeasurements] = useState<Map<string, MeasuredNode>>(
    () => new Map()
  );
  const nodeElementsRef = useRef<Map<string, HTMLDivElement>>(
    new Map()
  );
  const nodeObserversRef = useRef<Map<string, ResizeObserver>>(
    new Map()
  );

  useLayoutEffect(() => {
    const element = containerRef.current;

    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      setContainerSize((prev) => {
        const nextWidth = entry.contentRect.width;
        const nextHeight = entry.contentRect.height;

        if (
          prev.width === nextWidth &&
          prev.height === nextHeight
        ) {
          return prev;
        }

        return {
          width: nextWidth,
          height: nextHeight,
        };
      });
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const registerNode = useCallback(
    (nodeId: string, element: HTMLDivElement | null) => {
      const existingElement = nodeElementsRef.current.get(nodeId);
      const existingObserver = nodeObserversRef.current.get(nodeId);

      if (!element) {
        if (existingObserver) {
          existingObserver.disconnect();
          nodeObserversRef.current.delete(nodeId);
        }
        nodeElementsRef.current.delete(nodeId);
        return;
      }

      if (existingElement === element) {
        return;
      }

      if (existingObserver) {
        existingObserver.disconnect();
        nodeObserversRef.current.delete(nodeId);
      }

      nodeElementsRef.current.set(nodeId, element);

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

      const observer = new ResizeObserver(updateSize);
      observer.observe(element);
      nodeObserversRef.current.set(nodeId, observer);
    },
    []
  );

  useEffect(() => {
    const nodeObservers = nodeObserversRef.current;
    const nodeElements = nodeElementsRef.current;

    return () => {
      nodeObservers.forEach((observer) => {
        observer.disconnect();
      });
      nodeObservers.clear();
      nodeElements.clear();
    };
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
  const themeReady = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const activeColorMode =
    themeReady &&
    (resolvedTheme === "dark" || resolvedTheme === "light")
      ? resolvedTheme
      : colorMode;
  const canvasBackgroundColor =
    backgroundColor ||
    (activeColorMode === "dark"
      ? "hsl(222 18% 8%)"
      : "hsl(210 40% 98%)");

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

  const nodeBounds = useMemo(() => {
    return nodes.map((node) => {
      const size =
        measurements.get(node.id) || DEFAULT_NODE_SIZE;

      return {
        id: node.id,
        left: node.position.x,
        top: node.position.y,
        right: node.position.x + size.width,
        bottom: node.position.y + size.height,
        handles: node.data as {
          handles?: {
            source?: boolean;
            target?: boolean;
          };
        },
      };
    });
  }, [measurements, nodes]);

  const connectionPreviewPath = useMemo(() => {
    if (!connectionPreview) return null;

    const sourceNode = nodeBounds.find(
      (node) => node.id === connectionPreview.sourceNodeId
    );

    if (!sourceNode) return null;

    return getBezierPath({
      sourceX: sourceNode.right,
      sourceY: (sourceNode.top + sourceNode.bottom) / 2,
      targetX: connectionPreview.targetX,
      targetY: connectionPreview.targetY,
    });
  }, [connectionPreview, nodeBounds]);

  const getTargetNodeAtClientPosition = useCallback(
    (clientX: number, clientY: number) => {
      const element = containerRef.current;
      if (!element) return null;

      const rect = element.getBoundingClientRect();
      const worldX =
        (clientX - rect.left - activeViewport.x) /
        activeViewport.zoom;
      const worldY =
        (clientY - rect.top - activeViewport.y) /
        activeViewport.zoom;

      return (
        nodeBounds.find((node) => {
          const hasTarget =
            node.handles.handles?.target !== false;

          if (!hasTarget) return false;

          const insideNode =
            worldX >= node.left &&
            worldX <= node.right &&
            worldY >= node.top &&
            worldY <= node.bottom;

          const nearTargetHandle =
            Math.abs(worldX - node.left) <= 18 &&
            Math.abs(
              worldY - (node.top + node.bottom) / 2
            ) <= 18;

          return insideNode || nearTargetHandle;
        }) || null
      );
    },
    [activeViewport, nodeBounds]
  );

  const updateSelectionFromRect = useCallback(
    (
      startClientX: number,
      startClientY: number,
      currentClientX: number,
      currentClientY: number
    ) => {
      const element = containerRef.current;
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const left = Math.min(startClientX, currentClientX) - rect.left;
      const top = Math.min(startClientY, currentClientY) - rect.top;
      const width = Math.abs(currentClientX - startClientX);
      const height = Math.abs(currentClientY - startClientY);

      setSelectionRect({
        left,
        top,
        width,
        height,
      });

      const worldLeft =
        (left - activeViewport.x) / activeViewport.zoom;
      const worldTop =
        (top - activeViewport.y) / activeViewport.zoom;
      const worldRight =
        (left + width - activeViewport.x) / activeViewport.zoom;
      const worldBottom =
        (top + height - activeViewport.y) / activeViewport.zoom;

      setSelectedNodeIds(
        nodeBounds
          .filter(
            (node) =>
              node.left < worldRight &&
              node.right > worldLeft &&
              node.top < worldBottom &&
              node.bottom > worldTop
          )
          .map((node) => node.id)
      );
    },
    [activeViewport, nodeBounds]
  );

  const handleBackgroundPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const isCanvasRootTarget =
        event.target === event.currentTarget;
      const isBackgroundSvgTarget =
        event.target instanceof SVGSVGElement;

      if (!isCanvasRootTarget && !isBackgroundSvgTarget) {
        return;
      }

      if (event.shiftKey) {
        pointerStateRef.current = {
          mode: "select",
          pointerId: event.pointerId,
          startClientX: event.clientX,
          startClientY: event.clientY,
          currentClientX: event.clientX,
          currentClientY: event.clientY,
        };

        setSelectionRect({
          left: event.nativeEvent.offsetX,
          top: event.nativeEvent.offsetY,
          width: 0,
          height: 0,
        });
        setSelectedNodeIds([]);
        setSelectedEdgeId(null);
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }

      setSelectedNodeIds([]);
      setSelectedEdgeId(null);

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

      if (pointerState.mode === "select") {
        pointerStateRef.current = {
          ...pointerState,
          currentClientX: event.clientX,
          currentClientY: event.clientY,
        };

        updateSelectionFromRect(
          pointerState.startClientX,
          pointerState.startClientY,
          event.clientX,
          event.clientY
        );
        return;
      }

      if (pointerState.mode === "connect") {
        const targetNode = getTargetNodeAtClientPosition(
          event.clientX,
          event.clientY
        );

        pointerStateRef.current = {
          ...pointerState,
          currentClientX: event.clientX,
          currentClientY: event.clientY,
        };

        setHoveredTargetNodeId(targetNode?.id || null);

        if (targetNode) {
          setConnectionPreview({
            sourceNodeId: pointerState.sourceNodeId,
            sourceX: 0,
            sourceY: 0,
            targetX: targetNode.left,
            targetY:
              (targetNode.top + targetNode.bottom) / 2,
          });
          return;
        }

        const element = containerRef.current;
        if (!element) return;

        const rect = element.getBoundingClientRect();
        setConnectionPreview({
          sourceNodeId: pointerState.sourceNodeId,
          sourceX: 0,
          sourceY: 0,
          targetX:
            (event.clientX - rect.left - activeViewport.x) /
            activeViewport.zoom,
          targetY:
            (event.clientY - rect.top - activeViewport.y) /
            activeViewport.zoom,
        });
        return;
      }

      if (pointerState.mode === "reconnect-edge") {
        const targetNode = getTargetNodeAtClientPosition(
          event.clientX,
          event.clientY
        );

        pointerStateRef.current = {
          ...pointerState,
          currentClientX: event.clientX,
          currentClientY: event.clientY,
        };

        setHoveredTargetNodeId(targetNode?.id || null);

        if (targetNode) {
          setConnectionPreview({
            edgeId: pointerState.edgeId,
            sourceNodeId: pointerState.sourceNodeId,
            sourceX: 0,
            sourceY: 0,
            targetX: targetNode.left,
            targetY:
              (targetNode.top + targetNode.bottom) / 2,
          });
          return;
        }

        const element = containerRef.current;
        if (!element) return;

        const rect = element.getBoundingClientRect();
        setConnectionPreview({
          edgeId: pointerState.edgeId,
          sourceNodeId: pointerState.sourceNodeId,
          sourceX: 0,
          sourceY: 0,
          targetX:
            (event.clientX - rect.left - activeViewport.x) /
            activeViewport.zoom,
          targetY:
            (event.clientY - rect.top - activeViewport.y) /
            activeViewport.zoom,
        });
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
    [
      activeViewport.x,
      activeViewport.y,
      activeViewport.zoom,
      getTargetNodeAtClientPosition,
      onNodePositionChange,
      updateSelectionFromRect,
    ]
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

      if (pointerState.mode === "select") {
        updateSelectionFromRect(
          pointerState.startClientX,
          pointerState.startClientY,
          pointerState.currentClientX,
          pointerState.currentClientY
        );
        setSelectionRect(null);
        event.currentTarget.releasePointerCapture(event.pointerId);
        clearPointerState();
        return;
      }

      if (pointerState.mode === "connect") {
        const targetNode = getTargetNodeAtClientPosition(
          pointerState.currentClientX,
          pointerState.currentClientY
        );

        if (
          targetNode &&
          targetNode.id !== pointerState.sourceNodeId
        ) {
          onConnect?.({
            source: pointerState.sourceNodeId,
            target: targetNode.id,
          });
        }

        setHoveredTargetNodeId(null);
        setConnectionPreview(null);
        setReconnectingEdgeId(null);
        event.currentTarget.releasePointerCapture(
          event.pointerId
        );
        clearPointerState();
        return;
      }

      if (pointerState.mode === "reconnect-edge") {
        const targetNode = getTargetNodeAtClientPosition(
          pointerState.currentClientX,
          pointerState.currentClientY
        );

        if (
          targetNode &&
          targetNode.id !== pointerState.sourceNodeId
        ) {
          onReconnectEdgeTarget?.(
            pointerState.edgeId,
            targetNode.id
          );
        } else if (!targetNode) {
          onDeleteEdge?.(pointerState.edgeId);
        }

        setHoveredTargetNodeId(null);
        setConnectionPreview(null);
        setReconnectingEdgeId(null);
        event.currentTarget.releasePointerCapture(
          event.pointerId
        );
        clearPointerState();
        return;
      }

      if (pointerState.mode === "drag" && pointerState.moved) {
        suppressClickRef.current = pointerState.nodeId;
      }

      event.currentTarget.releasePointerCapture(event.pointerId);
      clearPointerState();
    },
    [
      clearPointerState,
      onDeleteEdge,
      getTargetNodeAtClientPosition,
      onConnect,
      onReconnectEdgeTarget,
      updateSelectionFromRect,
    ]
  );

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      if (event.cancelable) {
        event.preventDefault();
      }

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
    const element = containerRef.current;
    if (!element) return;

    const listener = (event: WheelEvent) => {
      handleWheel(event);
    };

    element.addEventListener("wheel", listener, {
      passive: false,
    });

    return () => {
      element.removeEventListener("wheel", listener);
    };
  }, [handleWheel]);

  useEffect(() => {
    return () => {
      if (zoomTransitionTimeoutRef.current) {
        clearTimeout(zoomTransitionTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Backspace" &&
        event.key !== "Delete"
      ) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }

      if (selectedEdgeId) {
        event.preventDefault();
        onDeleteEdge?.(selectedEdgeId);
        setSelectedEdgeId(null);
        return;
      }

      if (selectedNodeIds.length === 0) return;

      event.preventDefault();
      onDeleteNodes?.(selectedNodeIds);
      setSelectedNodeIds([]);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onDeleteEdge, onDeleteNodes, selectedEdgeId, selectedNodeIds]);

  return (
    <div
      ref={containerRef}
      className={className}
      onPointerDown={handleBackgroundPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        position: "relative",
        backgroundColor: canvasBackgroundColor,
        touchAction: "none",
        ...style,
      }}
    >
      {selectionRect ? (
        <div
          className="pointer-events-none absolute border border-primary/40 bg-primary/10"
          style={{
            left: selectionRect.left,
            top: selectionRect.top,
            width: selectionRect.width,
            height: selectionRect.height,
            zIndex: 20,
          }}
        />
      ) : null}
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
            backgroundColor: canvasBackgroundColor,
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
            pointerEvents: "auto",
          }}
        >
          {edgeGeometry.map(({ edge, sourceX, sourceY, targetX, targetY }) => {
            if (reconnectingEdgeId === edge.id) {
              return null;
            }

            const EdgeComponent = edgeTypes[edge.type || "animated"];
            const path = getBezierPath({
              sourceX,
              sourceY,
              targetX,
              targetY,
            });
            const isSelected = selectedEdgeId === edge.id;

            if (EdgeComponent) {
              return (
                <g key={edge.id}>
                  <EdgeComponent
                    id={edge.id}
                    label={edge.label}
                    sourceX={sourceX}
                    sourceY={sourceY}
                    targetX={targetX}
                    targetY={targetY}
                    selected={isSelected}
                  />
                  <path
                    d={path}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={16}
                    style={{
                      pointerEvents: "stroke",
                      cursor: "pointer",
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedNodeIds([]);
                      setSelectedEdgeId(edge.id);
                    }}
                    onPointerDown={(event) => {
                      if (!isSelected) return;

                      event.stopPropagation();

                      pointerStateRef.current = {
                        mode: "reconnect-edge",
                        pointerId: event.pointerId,
                        edgeId: edge.id,
                        sourceNodeId: edge.source,
                        startClientX: event.clientX,
                        startClientY: event.clientY,
                        currentClientX: event.clientX,
                        currentClientY: event.clientY,
                      };

                      setConnectionPreview({
                        edgeId: edge.id,
                        sourceNodeId: edge.source,
                        sourceX,
                        sourceY,
                        targetX,
                        targetY,
                      });
                      setReconnectingEdgeId(edge.id);
                      setHoveredTargetNodeId(null);
                      containerRef.current?.setPointerCapture(
                        event.pointerId
                      );
                    }}
                  />
                  {isSelected ? (
                    <circle
                      cx={targetX}
                      cy={targetY}
                      r={8}
                      fill="var(--background)"
                      stroke="currentColor"
                      strokeOpacity={0.5}
                      strokeWidth={1.5}
                      style={{
                        pointerEvents: "all",
                        cursor: "grab",
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation();

                        pointerStateRef.current = {
                          mode: "reconnect-edge",
                          pointerId: event.pointerId,
                          edgeId: edge.id,
                          sourceNodeId: edge.source,
                          startClientX: event.clientX,
                          startClientY: event.clientY,
                          currentClientX: event.clientX,
                          currentClientY: event.clientY,
                        };

                        setConnectionPreview({
                          edgeId: edge.id,
                          sourceNodeId: edge.source,
                          sourceX,
                          sourceY,
                          targetX,
                          targetY,
                        });
                        setReconnectingEdgeId(edge.id);
                        setHoveredTargetNodeId(null);
                        containerRef.current?.setPointerCapture(
                          event.pointerId
                        );
                      }}
                    />
                  ) : null}
                </g>
              );
            }

            return (
              <g key={edge.id}>
                <path
                  d={path}
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity={0.35}
                  strokeWidth={1.5}
                />
                <path
                  d={path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={16}
                  style={{
                    pointerEvents: "stroke",
                    cursor: "pointer",
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedNodeIds([]);
                    setSelectedEdgeId(edge.id);
                  }}
                />
              </g>
            );
          })}
          {connectionPreviewPath ? (
            <path
              d={connectionPreviewPath}
              fill="none"
              stroke="currentColor"
              strokeDasharray="6 6"
              strokeOpacity={0.6}
              strokeWidth={1.5}
            />
          ) : null}
        </svg>

        {nodes.map((node) => {
          const NodeComponent = nodeTypes[node.type];
          if (!NodeComponent) return null;
          const nodeHandles = (node.data as {
            handles?: {
              target?: boolean;
              source?: boolean;
            };
          }).handles;

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

                const multiSelect =
                  event.shiftKey ||
                  event.metaKey ||
                  event.ctrlKey;

                setSelectedNodeIds((prev) => {
                  if (multiSelect) {
                    return prev.includes(node.id)
                      ? prev.filter((id) => id !== node.id)
                      : [...prev, node.id];
                  }

                  return [node.id];
                });
                setSelectedEdgeId(null);

                if (!multiSelect) {
                  onNodeClick?.(event, node);
                }
              }}
              style={{
                position: "absolute",
                left: node.position.x,
                top: node.position.y,
                cursor: "grab",
                willChange: "transform",
              }}
            >
              {nodeHandles?.target ? (
                <button
                  type="button"
                  aria-label={`Target handle for ${node.id}`}
                  className="absolute left-0 top-1/2 z-20 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent"
                  onPointerUp={(event) => {
                    event.stopPropagation();
                  }}
                />
              ) : null}
              {nodeHandles?.source ? (
                <button
                  type="button"
                  aria-label={`Source handle for ${node.id}`}
                  className="absolute right-0 top-1/2 z-20 h-5 w-5 translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent"
                  onPointerDown={(event) => {
                    event.stopPropagation();

                    pointerStateRef.current = {
                      mode: "connect",
                      pointerId: event.pointerId,
                      sourceNodeId: node.id,
                      startClientX: event.clientX,
                      startClientY: event.clientY,
                      currentClientX: event.clientX,
                      currentClientY: event.clientY,
                    };

                    setConnectionPreview({
                      sourceNodeId: node.id,
                      sourceX:
                        node.position.x +
                        (measurements.get(node.id)?.width ||
                          DEFAULT_NODE_SIZE.width),
                      sourceY:
                        node.position.y +
                        (measurements.get(node.id)?.height ||
                          DEFAULT_NODE_SIZE.height) /
                          2,
                      targetX:
                        node.position.x +
                        (measurements.get(node.id)?.width ||
                          DEFAULT_NODE_SIZE.width),
                      targetY:
                        node.position.y +
                        (measurements.get(node.id)?.height ||
                          DEFAULT_NODE_SIZE.height) /
                          2,
                    });
                    setReconnectingEdgeId(null);
                    setHoveredTargetNodeId(null);
                    containerRef.current?.setPointerCapture(
                      event.pointerId
                    );
                  }}
                />
              ) : null}
              <NodeComponent
                data={node.data}
                selected={selectedNodeIds.includes(node.id)}
              />
              {hoveredTargetNodeId === node.id ? (
                <span className="pointer-events-none absolute left-0 top-1/2 z-30 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary bg-primary/15" />
              ) : null}
            </div>
          );
        })}

        {children}
      </div>

    </div>
  );
}
