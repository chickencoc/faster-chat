import { useState } from "preact/hooks";
import { useQuery } from "@tanstack/react-query";
import { Download, File, Sparkles } from "lucide-preact";
import { API_BASE, apiFetch } from "@/lib/api";
import { useUiState } from "@/state/useUiState";
import PromptToolsModal from "@/components/imagegen/PromptToolsModal";
import ImagePreview from "./ImagePreview";

export default function MessageAttachment({ fileId }) {
  const [view, setView] = useState(null);
  const setPendingPrompt = useUiState((state) => state.setPendingPrompt);
  const {
    data: fileMetadata,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["file", fileId],
    queryFn: () => apiFetch(`/api/files/${fileId}`),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  if (isLoading) {
    return (
      <div className="bg-theme-surface/50 text-theme-text-muted inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
        <File size={16} />
        <span>Loading...</span>
      </div>
    );
  }

  if (error || !fileMetadata) {
    return (
      <div className="bg-theme-red/10 text-theme-red inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
        <File size={16} />
        <span>File unavailable</span>
      </div>
    );
  }

  const isImage =
    fileMetadata.meta?.type !== "generated-document" && fileMetadata.mimeType?.startsWith("image/");
  const isGenerated = fileMetadata.meta?.type === "generated";
  const url = `${API_BASE}/api/files/${fileId}/content`;

  // Render images inline
  if (isImage) {
    return (
      <div className="relative inline-block max-w-full">
        <button
          type="button"
          aria-label={`Preview image: ${fileMetadata.filename}`}
          onClick={() => setView("preview")}
          className="group relative block max-w-full cursor-zoom-in rounded-lg">
          <img
            src={url}
            alt={fileMetadata.meta?.prompt || fileMetadata.filename}
            className="max-h-96 max-w-full rounded-lg shadow-md"
            loading="lazy"
          />
          {isGenerated && (
            <span className="bg-theme-pink/90 absolute top-2 left-2 flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <Sparkles size={12} />
              Generated
            </span>
          )}
        </button>
        {view === "preview" && (
          <ImagePreview
            url={url}
            filename={fileMetadata.filename}
            alt={fileMetadata.meta?.prompt || fileMetadata.filename}
            onPrompt={() => setView("prompt")}
            onClose={() => setView(null)}
          />
        )}
        {view === "prompt" && (
          <PromptToolsModal
            fileId={fileId}
            onInsert={setPendingPrompt}
            onClose={() => setView(null)}
          />
        )}
      </div>
    );
  }

  return (
    <a
      href={url}
      download={fileMetadata.filename}
      target="_blank"
      rel="noopener"
      className="bg-theme-surface hover:bg-theme-surface-strong text-theme-text inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors">
      <File size={16} />
      <span className="max-w-[200px] truncate">{fileMetadata.filename}</span>
      <span className="text-theme-text-muted text-xs">{fileMetadata.sizeFormatted}</span>
      <Download size={14} />
    </a>
  );
}
