import { createPortal } from "preact/compat";
import { useEffect, useRef } from "preact/hooks";
import { Download, ScanText, X } from "lucide-preact";

const actionClass =
  "bg-theme-canvas/90 text-theme-text hover:bg-theme-surface-strong flex size-10 items-center justify-center rounded-full shadow-sm transition-colors";

export default function ImagePreview({ url, filename, alt, onPrompt, onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-label="Image preview"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="backdrop:bg-theme-overlay/40 fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-transparent backdrop:backdrop-blur-md">
      <div className="pointer-events-none grid h-full grid-rows-[minmax(0,1fr)] place-items-center px-4 pt-16 pb-4">
        <img
          src={url}
          alt={alt}
          className="pointer-events-auto max-h-full max-w-full object-contain"
        />
      </div>
      <div className="absolute top-4 right-4 flex gap-2">
        <button
          type="button"
          onClick={onPrompt}
          className={actionClass}
          aria-label="Generate image prompt"
          title="Generate image prompt">
          <ScanText size={19} />
        </button>
        <a
          href={url}
          download={filename}
          className={actionClass}
          aria-label="Download image"
          title="Download image">
          <Download size={19} />
        </a>
        <button
          type="button"
          onClick={onClose}
          className={actionClass}
          aria-label="Close image preview"
          title="Close image preview"
          autoFocus>
          <X size={19} />
        </button>
      </div>
    </dialog>,
    document.body
  );
}
