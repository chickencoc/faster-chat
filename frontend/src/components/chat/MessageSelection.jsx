import { createPortal } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import { MAX_CHAT_QUOTES, useChatQuote } from "@/state/useChatQuote";

function getMessageText(node) {
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  return element?.closest("[data-chat-message-text]");
}

export default function MessageSelection({ chatId, messageListRef }) {
  const atLimit = useChatQuote(
    (state) => state.quote?.chatId === chatId && state.quote?.items.length >= MAX_CHAT_QUOTES
  );
  const [selection, setSelection] = useState(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    let pointerDown = false;

    function updateSelection() {
      if (pointerDown) {
        return;
      }
      const current = window.getSelection();
      if (!current?.rangeCount || current.isCollapsed) {
        setSelection(null);
        return;
      }

      const range = current.getRangeAt(0);
      const messageText = getMessageText(range.startContainer);
      const value = current.toString().trim();
      if (
        !value ||
        !messageText ||
        !messageListRef.current?.contains(messageText) ||
        messageText !== getMessageText(range.endContainer)
      ) {
        setSelection(null);
        return;
      }

      const rect = range.getBoundingClientRect();
      const below = rect.top < 48;
      setSelection({
        text: value,
        x: Math.max(80, Math.min(rect.left + rect.width / 2, window.innerWidth - 80)),
        y: below ? rect.bottom + 6 : rect.top - 6,
        below,
      });
    }

    const dismiss = () => setSelection(null);
    function startSelection(event) {
      if (buttonRef.current?.contains(event.target)) {
        return;
      }
      pointerDown = true;
      dismiss();
    }
    function finishSelection() {
      if (pointerDown) {
        pointerDown = false;
        updateSelection();
      }
    }
    function cancelSelection() {
      pointerDown = false;
      dismiss();
    }

    window.addEventListener("pointerdown", startSelection, true);
    window.addEventListener("pointerup", finishSelection, true);
    window.addEventListener("pointercancel", cancelSelection, true);
    document.addEventListener("selectionchange", updateSelection);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("pointerdown", startSelection, true);
      window.removeEventListener("pointerup", finishSelection, true);
      window.removeEventListener("pointercancel", cancelSelection, true);
      document.removeEventListener("selectionchange", updateSelection);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [messageListRef]);

  if (!selection) {
    return null;
  }

  function addToChat() {
    useChatQuote.getState().addQuote(chatId, selection.text);
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }

  return createPortal(
    <button
      ref={buttonRef}
      type="button"
      onPointerDown={(event) => event.preventDefault()}
      onClick={addToChat}
      disabled={atLimit}
      title={
        atLimit ? `선택한 텍스트는 최대 ${MAX_CHAT_QUOTES}개까지 추가할 수 있습니다.` : undefined
      }
      className={`bg-theme-surface text-theme-text border-theme-border hover:bg-theme-surface-strong focus-visible:ring-theme-primary fixed z-50 -translate-x-1/2 rounded-[10px] border px-3 py-1.5 text-sm whitespace-nowrap shadow-md transition-colors duration-75 focus-visible:ring-2 disabled:opacity-60 ${selection.below ? "" : "-translate-y-full"}`}
      style={{ left: selection.x, top: selection.y }}>
      채팅에 추가하기
    </button>,
    document.body
  );
}
