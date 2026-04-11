"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const MIN_CANVAS_WIDTH = 420;
const MIN_CHATBOT_WIDTH = 320;
const DEFAULT_CHATBOT_WIDTH = 420;

function clampValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function useResizableChatbotPanel() {
  const [chatbotWidth, setChatbotWidth] = useState(DEFAULT_CHATBOT_WIDTH);
  const [contentWidth, setContentWidth] = useState(0);
  const [isResizing, setIsResizing] = useState(false);
  const [isChatbotCollapsed, setIsChatbotCollapsed] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const resizeStateRef = useRef<{
    startClientX: number;
    startWidth: number;
    containerWidth: number;
  } | null>(null);
  const resizeRafRef = useRef<number | null>(null);
  const pendingWidthRef = useRef<number | null>(null);

  useEffect(() => {
    const element = contentRef.current;

    if (!element) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      const nextWidth = entry.contentRect.width;

      setContentWidth((previousWidth) => {
        if (Math.abs(previousWidth - nextWidth) < 0.5) {
          return previousWidth;
        }

        return nextWidth;
      });
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const maxChatbotWidth = useMemo(() => {
    if (contentWidth === 0) {
      return DEFAULT_CHATBOT_WIDTH;
    }

    return Math.max(MIN_CHATBOT_WIDTH, contentWidth - MIN_CANVAS_WIDTH);
  }, [contentWidth]);

  useEffect(() => {
    setChatbotWidth((current) =>
      clampValue(current, MIN_CHATBOT_WIDTH, maxChatbotWidth)
    );
  }, [maxChatbotWidth]);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const currentResize = resizeStateRef.current;
      if (!currentResize) return;

      const deltaX = currentResize.startClientX - event.clientX;
      const maxWidth = Math.max(
        MIN_CHATBOT_WIDTH,
        currentResize.containerWidth - MIN_CANVAS_WIDTH
      );

      const nextWidth = clampValue(
        currentResize.startWidth + deltaX,
        MIN_CHATBOT_WIDTH,
        maxWidth
      );

      pendingWidthRef.current = nextWidth;

      if (resizeRafRef.current !== null) {
        return;
      }

      resizeRafRef.current = window.requestAnimationFrame(() => {
        const pendingWidth = pendingWidthRef.current;
        resizeRafRef.current = null;

        if (pendingWidth === null) return;

        setChatbotWidth((current) => {
          if (Math.abs(current - pendingWidth) < 0.5) {
            return current;
          }

          return pendingWidth;
        });
      });
    };

    const stopResizing = () => {
      setIsResizing(false);
      resizeStateRef.current = null;
      pendingWidthRef.current = null;

      if (resizeRafRef.current !== null) {
        window.cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
    };
  }, [isResizing]);

  useEffect(() => {
    return () => {
      if (resizeRafRef.current !== null) {
        window.cancelAnimationFrame(resizeRafRef.current);
      }
    };
  }, []);

  const handleResizeStart = useCallback(
    (clientX: number) => {
      if (isChatbotCollapsed) {
        return;
      }

      const container = contentRef.current;
      if (!container) {
        return;
      }

      resizeStateRef.current = {
        startClientX: clientX,
        startWidth: chatbotWidth,
        containerWidth: container.getBoundingClientRect().width,
      };
      setIsResizing(true);
    },
    [chatbotWidth, isChatbotCollapsed]
  );

  return {
    contentRef,
    chatbotWidth,
    isChatbotCollapsed,
    setIsChatbotCollapsed,
    handleResizeStart,
    effectiveChatbotWidth: isChatbotCollapsed ? 0 : chatbotWidth,
  };
}
