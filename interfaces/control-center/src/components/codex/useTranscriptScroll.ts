"use client";

import { useLayoutEffect, useRef } from "react";

type Anchor = { id: string; offset: number };

/** One owner for transcript position, including asynchronous child layout changes. */
export function useTranscriptScroll(chatId: string | null) {
  const transcriptRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const reconcileRef = useRef<() => void>(() => {});
  const preserveRef = useRef<() => void>(() => {});
  const latestRef = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    const viewport = transcriptRef.current, content = contentRef.current;
    if (!viewport || !content) return;
    let following = true;
    let anchors: Anchor[] = [];
    let top = viewport.scrollTop, height = viewport.scrollHeight, clientHeight = viewport.clientHeight;
    let userInput = false;
    const elements = () => Array.from(content.querySelectorAll<HTMLElement>("[data-scroll-anchor]"));
    const capture = () => {
      const bounds = viewport.getBoundingClientRect();
      anchors = elements().filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.bottom > bounds.top && rect.top < bounds.bottom;
      }).slice(0, 3).map(el => ({ id: el.dataset.scrollAnchor!, offset: el.getBoundingClientRect().top - bounds.top }));
      top = viewport.scrollTop; height = viewport.scrollHeight; clientHeight = viewport.clientHeight;
    };
    const preserve = () => { following = false; capture(); };
    const reconcile = () => {
      if (following) viewport.scrollTop = viewport.scrollHeight;
      else {
        const candidates = elements();
        const anchor = anchors.find(saved => candidates.some(el => el.dataset.scrollAnchor === saved.id));
        const element = anchor && candidates.find(el => el.dataset.scrollAnchor === anchor.id);
        if (anchor && element) {
          const offset = element.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
          viewport.scrollTop += offset - anchor.offset;
        }
      }
      capture();
    };
    const onScroll = () => {
      if (Math.abs(viewport.scrollTop - top) <= 1) return;
      // A size change can clamp scrollTop without a user scroll. It must not
      // silently switch follow mode (nor compete with our own position write).
      if (userInput || (height === viewport.scrollHeight && clientHeight === viewport.clientHeight)) {
        following = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 24;
        capture();
      } else reconcile();
      userInput = false;
    };
    const onWheel = (event: WheelEvent) => {
      userInput = true;
      if (event.deltaY < 0) preserve();
      else if (event.deltaY > 0 && viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 24) following = true;
    };
    let touchY = 0;
    const onTouchStart = (event: TouchEvent) => { touchY = event.touches[0]?.clientY || 0; };
    const onTouchMove = (event: TouchEvent) => {
      userInput = true;
      const y = event.touches[0]?.clientY || touchY;
      if (y > touchY) preserve();
      touchY = y;
    };
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).matches("input, textarea, [contenteditable=true]")) return;
      if (["ArrowUp", "PageUp", "Home"].includes(event.key) || (event.key === " " && event.shiftKey)) { userInput = true; preserve(); }
      else if (["ArrowDown", "PageDown", "End", " "].includes(event.key)) userInput = true;
    };
    const onPointer = (event: PointerEvent) => { if (event.target === viewport) userInput = true; };
    const onClick = (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest("summary")) preserve();
    };
    // Loading another large text chunk is intentional expansion, not a new
    // message. Keep its beginning reachable; never auto-drain the whole body.
    const onExpand = () => preserve();
    reconcileRef.current = reconcile; preserveRef.current = preserve;
    latestRef.current = () => { following = true; reconcile(); };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    viewport.addEventListener("wheel", onWheel, { passive: true });
    viewport.addEventListener("touchstart", onTouchStart, { passive: true });
    viewport.addEventListener("touchmove", onTouchMove, { passive: true });
    viewport.addEventListener("keydown", onKey);
    viewport.addEventListener("pointerdown", onPointer);
    viewport.addEventListener("click", onClick, true);
    viewport.addEventListener("codex-history-expand", onExpand);
    const resize = new ResizeObserver(reconcile);
    resize.observe(viewport); resize.observe(content);
    const mutations = new MutationObserver(reconcile);
    mutations.observe(content, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["open"] });
    reconcile();
    return () => {
      resize.disconnect(); mutations.disconnect();
      viewport.removeEventListener("scroll", onScroll);
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchmove", onTouchMove);
      viewport.removeEventListener("keydown", onKey);
      viewport.removeEventListener("pointerdown", onPointer);
      viewport.removeEventListener("click", onClick, true);
      viewport.removeEventListener("codex-history-expand", onExpand);
      reconcileRef.current = () => {}; preserveRef.current = () => {}; latestRef.current = () => {};
    };
  }, [chatId]);

  useLayoutEffect(() => { reconcileRef.current(); });
  return { transcriptRef, contentRef, preservePosition: () => preserveRef.current(), followLatest: () => latestRef.current() };
}
