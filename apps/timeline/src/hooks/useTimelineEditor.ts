import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  StudioFileConflictError,
  flushStudioPendingEdits,
  useEditHistoryActions,
  usePersistentEditHistory,
  usePlayerStore,
  useProjectFileWriter,
  useRenderClipContent,
  useTimelineEditing,
  useTimelinePlayer,
  type TimelineElement,
} from "@hyperframes/studio";
import { buildTimelineEditCallbacks } from "../lib/timelineEditCallbacks";
import { useLiveTime } from "./useLiveTime";

/** The composition the timeline edits. Sub-compositions carry their own
 *  sourceFile on each element, so only the root is named here. */
const ROOT_COMPOSITION = "index.html";

/** Studio's fit zoom never spans less than 60 s of ruler, and adds 20 % headroom
 *  (MIN_TIMELINE_EXTENT_S and FIT_ZOOM_HEADROOM in its timelineLayout.ts, not
 *  exported). A 15 s page then fills a quarter of the lane, so shorter
 *  compositions open zoomed in to fill it instead. */
const STUDIO_MIN_EXTENT_S = 60;
const STUDIO_FIT_HEADROOM = 1.2;

export type TimelineStatus = { message: string; tone: "error" | "info" } | null;

/** Messages exchanged with the embedding artefact-editor page. */
export const HOST_MESSAGES = {
  /** timeline → host: a project file changed on disk; reload blocks. */
  changed: "ae:timeline-changed",
  /** host → timeline: the host saved the project; reload the preview. */
  refresh: "ae:refresh-preview",
} as const;

function notifyHost(projectId: string): void {
  if (window.parent === window) return;
  window.parent.postMessage(
    { type: HOST_MESSAGES.changed, projectId },
    window.location.origin,
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

async function waitForPendingEdits(): Promise<void> {
  const result = await flushStudioPendingEdits();
  if (result.status !== "clean") throw result.error;
}

async function noUploads(): Promise<string[]> {
  return [];
}

/** The player names its preview iframe after the upstream product; use a neutral title. */
function retitlePreview(node: HTMLIFrameElement | null): void {
  node?.setAttribute("title", "Composition preview");
}

/**
 * Everything the timeline page needs: the preview player, the timeline's
 * edit callbacks, undo/redo and the conflict state. Composes Studio's public
 * host-mount hooks the way its own hostMount test does.
 */
export function useTimelineEditor(projectId: string | null) {
  const [status, setStatus] = useState<TimelineStatus>(null);
  const [conflict, setConflict] = useState<StudioFileConflictError | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((message: string, tone: "error" | "info" = "info") => {
    clearTimeout(statusTimerRef.current);
    setStatus({ message, tone });
    statusTimerRef.current = setTimeout(() => setStatus(null), 4000);
  }, []);

  const player = useTimelinePlayer({
    onPreviewReloadFailed: (message) => showToast(message, "error"),
  });
  const { iframeRef, refreshPlayer } = player;

  const elements = usePlayerStore((s) => s.elements);
  const duration = usePlayerStore((s) => s.duration);
  const playing = usePlayerStore((s) => s.isPlaying);
  const ready = usePlayerStore((s) => s.timelineReady);
  const time = useLiveTime();

  const writer = useProjectFileWriter({ projectId });
  const editHistory = usePersistentEditHistory({ projectId });
  const pendingTimelineEditPathRef = useRef(new Set<string>());

  const writeProjectFile = useCallback(
    async (path: string, content: string, expectedContent?: string) => {
      try {
        await writer.writeProjectFile(path, content, expectedContent);
      } catch (error) {
        if (error instanceof StudioFileConflictError) setConflict(error);
        throw error;
      }
      if (projectId) notifyHost(projectId);
    },
    [writer.writeProjectFile, projectId],
  );

  const timelineEditing = useTimelineEditing({
    projectId,
    activeCompPath: ROOT_COMPOSITION,
    timelineElements: elements,
    showToast,
    writeProjectFile,
    observeProjectFileVersion: writer.observeProjectFileVersion,
    recordEdit: editHistory.recordEdit,
    reloadPreview: refreshPlayer,
    previewIframeRef: iframeRef,
    pendingTimelineEditPathRef,
    uploadProjectFiles: noUploads,
  });
  const { restoreLiveLanes } = timelineEditing;

  const syncHistoryPreviewAfterApply = useCallback(async () => {
    refreshPlayer();
  }, [refreshPlayer]);

  const handleAfterUndoRedo = useCallback(
    (restore: Parameters<typeof restoreLiveLanes>[0]) => {
      restoreLiveLanes(restore);
      if (projectId) notifyHost(projectId);
    },
    [restoreLiveLanes, projectId],
  );

  const { undo, redo } = useEditHistoryActions({
    editHistory,
    readOptionalProjectFile: writer.readOptionalProjectFile,
    readProjectFile: writer.readProjectFile,
    writeProjectFile,
    showToast,
    syncHistoryPreviewAfterApply,
    waitForPendingDomEditSaves: waitForPendingEdits,
    onAfterUndoRedo: handleAfterUndoRedo,
    activeCompPath: ROOT_COMPOSITION,
  });

  // useTimelineEditing returns a fresh object each render; key the memo on
  // the handlers themselves so <Timeline> keeps a stable callback bag.
  const {
    handleTimelineElementMove,
    handleTimelineGroupMove,
    handleTimelineElementResize,
    handleTimelineGroupResize,
    handleToggleTrackHidden,
    handleBlockedTimelineEdit,
    handleTimelineElementSplit,
    handleRazorSplit,
    handleRazorSplitAll,
  } = timelineEditing;
  const editCallbacks = useMemo(
    () =>
      buildTimelineEditCallbacks({
        handleTimelineElementMove,
        handleTimelineGroupMove,
        handleTimelineElementResize,
        handleTimelineGroupResize,
        handleToggleTrackHidden,
        handleBlockedTimelineEdit,
        handleTimelineElementSplit,
        handleRazorSplit,
        handleRazorSplitAll,
      }),
    [
      handleTimelineElementMove,
      handleTimelineGroupMove,
      handleTimelineElementResize,
      handleTimelineGroupResize,
      handleToggleTrackHidden,
      handleBlockedTimelineEdit,
      handleTimelineElementSplit,
      handleRazorSplit,
      handleRazorSplitAll,
    ],
  );

  const handleDeleteElement = useCallback(
    (element: TimelineElement) => timelineEditing.handleTimelineElementDelete(element),
    [timelineEditing.handleTimelineElementDelete],
  );

  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const [compIdToSrc] = useState(() => new Map<string, string>());
  const renderClipContent = useRenderClipContent({
    projectIdRef,
    compIdToSrc,
    activePreviewUrl: projectId
      ? `/api/projects/${encodeURIComponent(projectId)}/preview/comp/${ROOT_COMPOSITION}`
      : null,
    effectiveTimelineDuration: duration,
  });

  const setLiveIframe = useCallback(
    (node: HTMLIFrameElement | null) => {
      iframeRef.current = node;
      retitlePreview(node);
    },
    [iframeRef],
  );

  const { setShadowIframeNode } = player;
  const setShadowIframe = useCallback(
    (node: HTMLIFrameElement | null) => {
      setShadowIframeNode(node);
      retitlePreview(node);
    },
    [setShadowIframeNode],
  );

  const handleConflictReload = useCallback(() => {
    setConflict(null);
    refreshPlayer();
  }, [refreshPlayer]);

  const handleConflictDismiss = useCallback(() => setConflict(null), []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      void (event.shiftKey ? redo() : undo());
    },
    [undo, redo],
  );

  const handleHostMessage = useCallback(
    (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== window.location.origin) return;
      const data = event.data as { type?: unknown } | null;
      if (data?.type === HOST_MESSAGES.refresh) refreshPlayer();
    },
    [refreshPlayer],
  );

  // Space, the arrows and J/K/L are bound by useTimelinePlayer itself.
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    window.addEventListener("message", handleHostMessage);
    return () => window.removeEventListener("message", handleHostMessage);
  }, [handleHostMessage]);

  // The player store is a module singleton; scope it to this project.
  useEffect(() => {
    if (projectId) usePlayerStore.getState().beginTimelineSession(projectId);
  }, [projectId]);

  // Open each project zoomed to its own length (once; later zooming is the user's).
  const zoomedProjectRef = useRef<string | null>(null);
  useEffect(() => {
    if (!projectId || !ready || !(duration > 0) || zoomedProjectRef.current === projectId) return;
    zoomedProjectRef.current = projectId;
    const span = duration * STUDIO_FIT_HEADROOM;
    if (span >= STUDIO_MIN_EXTENT_S) return;
    const store = usePlayerStore.getState();
    store.setZoomMode("manual");
    store.setManualZoomPercent((STUDIO_MIN_EXTENT_S / span) * 100);
  }, [projectId, ready, duration]);

  return {
    player: {
      previewSlots: player.previewSlots,
      setLiveIframe,
      onIframeLoad: player.onIframeLoad,
      setShadowIframe,
      onShadowIframeLoad: player.onShadowIframeLoad,
      onShadowReadyChange: player.onShadowReadyChange,
      onShadowError: player.onShadowError,
    },
    transport: {
      ready,
      playing,
      time,
      duration,
      togglePlay: player.togglePlay,
      seek: player.seek,
    },
    editCallbacks,
    handleDeleteElement,
    renderClipContent,
    history: {
      undo,
      redo,
      canUndo: editHistory.canUndo,
      canRedo: editHistory.canRedo,
    },
    conflict,
    handleConflictReload,
    handleConflictDismiss,
    status,
  };
}

export type TimelineEditorState = ReturnType<typeof useTimelineEditor>;
