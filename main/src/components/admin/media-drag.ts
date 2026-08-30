import type { DragEvent as ReactDragEvent } from "react";
import {
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  COMMAND_PRIORITY_HIGH,
  DRAGOVER_COMMAND,
  DROP_COMMAND,
  type LexicalEditor,
} from "lexical";

export const MEDIA_DRAG_TYPE = "application/x-myblog-media";

const boundEditors = new WeakSet<LexicalEditor>();

function rangeFromPoint(clientX: number, clientY: number): Range | null {
  if (document.caretRangeFromPoint) {
    return document.caretRangeFromPoint(clientX, clientY);
  }
  const doc = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
  };
  const caret = doc.caretPositionFromPoint?.(clientX, clientY);
  if (!caret) {
    return null;
  }
  const range = document.createRange();
  range.setStart(caret.offsetNode, caret.offset);
  range.collapse(true);
  return range;
}

function moveNode(editor: LexicalEditor, key: string, clientX: number, clientY: number) {
  editor.update(() => {
    const movingNode = $getNodeByKey(key);
    if (!movingNode) {
      return;
    }
    const moving = movingNode.getTopLevelElement() ?? movingNode;
    const range = rangeFromPoint(clientX, clientY);
    const targetDom = range?.startContainer;
    if (!(targetDom instanceof Node)) {
      return;
    }
    const hit =
      targetDom instanceof HTMLElement
        ? targetDom
        : targetDom.parentElement;
    const lexicalTarget = $getNearestNodeFromDOMNode(hit ?? targetDom);
    if (!lexicalTarget) {
      return;
    }
    const target = lexicalTarget.getTopLevelElement() ?? lexicalTarget;
    if (target.getKey() === moving.getKey()) {
      return;
    }
    const targetElement =
      targetDom instanceof Element
        ? targetDom
        : targetDom.parentElement;
    const before =
      targetElement instanceof Element &&
      clientY < targetElement.getBoundingClientRect().top + targetElement.getBoundingClientRect().height / 2;
    moving.remove();
    if (before) {
      target.insertBefore(moving);
    } else {
      target.insertAfter(moving);
    }
  });
}

export function ensureMediaDrop(editor: LexicalEditor) {
  if (boundEditors.has(editor)) {
    return;
  }
  boundEditors.add(editor);

  editor.registerCommand(
    DRAGOVER_COMMAND,
    (event) => {
      if (!event.dataTransfer?.types.includes(MEDIA_DRAG_TYPE)) {
        return false;
      }
      event.preventDefault();
      return true;
    },
    COMMAND_PRIORITY_HIGH,
  );

  editor.registerCommand(
    DROP_COMMAND,
    (event) => {
      const raw = event.dataTransfer?.getData(MEDIA_DRAG_TYPE);
      if (!raw) {
        return false;
      }
      event.preventDefault();
      try {
        const parsed = JSON.parse(raw) as { key?: string };
        if (parsed.key) {
          moveNode(editor, parsed.key, event.clientX, event.clientY);
        }
      } catch {
        return true;
      }
      return true;
    },
    COMMAND_PRIORITY_HIGH,
  );
}

export function mediaDragStart(event: ReactDragEvent, key: string) {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(MEDIA_DRAG_TYPE, JSON.stringify({ key }));
}
