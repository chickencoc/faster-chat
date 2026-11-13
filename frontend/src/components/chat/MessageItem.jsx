import { MarkdownContent } from "@/components/markdown/MarkdownRenderer";
import { extractTextContent } from "@/lib/messageUtils";
import { formatTokenStats } from "@/lib/tokenStats";
import { useThemeStore } from "@/state/useThemeStore";
import { memo } from "@preact/compat";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import {
  AlertTriangle,
  Brain,
  ChevronRight,
  Copy,
  FileCode,
  Globe,
  Image,
  MoreHorizontal,
  RotateCw,
  Sparkles,
} from "lucide-preact";
import { toast } from "sonner";
import MessageAttachment from "./MessageAttachment";
import ModelAvatar from "./ModelAvatar";
import SearchStatus from "./SearchStatus";
import SourceCitations, { extractSources, TOOL_ERROR_MESSAGES } from "./SourceCitations";

/**
 * Parse <think> blocks from content for reasoning models (DeepSeek R1, o1, etc.)
 * Returns { thinking: string[], content: string }
 */
const parseThinkingBlocks = (text) => {
  if (!text) {
    return { thinking: [], content: "" };
  }

  // Handle incomplete closing tag during streaming
  let processedText = text;
  const openCount = (text.match(/<think>/g) || []).length;
  const closeCount = (text.match(/<\/think>/g) || []).length;
  if (openCount > closeCount) {
    processedText += "</think>";
  }

  const thinking = [];
  const regex = /<think>([\s\S]*?)<\/think>/g;
  let match;
  while ((match = regex.exec(processedText)) !== null) {
    const thinkContent = match[1].trim();
    if (thinkContent) {
      thinking.push(thinkContent);
    }
  }

  // Remove think blocks from main content
  const content = processedText.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  return { thinking, content };
};

const actionClass =
  "text-theme-text-muted hover:bg-theme-surface-strong hover:text-theme-text rounded-lg p-2 transition-colors duration-75";

const nativeTools = {
  "tool-webSearch": { Icon: Globe, label: "Searching the web", done: "Web search completed" },
  "tool-imageGeneration": { Icon: Image, label: "Generating an image", done: "Image generated" },
  "tool-codeInterpreter": {
    Icon: FileCode,
    label: "Running code",
    done: "Code execution completed",
  },
};

const MessageItem = memo(({ message, isStreaming, onRegenerate }) => {
  const showTokenStats = useThemeStore((state) => state.showTokenStats);
  const isUser = message.role === "user";
  const rawContent = extractTextContent(message);
  const { thinking, content } = isUser
    ? { thinking: [], content: rawContent }
    : parseThinkingBlocks(rawContent);
  const summaries =
    message.parts?.filter((part) => part.type === "reasoning" && part.text.trim()) ?? [];
  const tools = isStreaming
    ? (message.parts?.filter((part) => Object.hasOwn(nativeTools, part.type)) ?? [])
    : [];
  const showActions = !isUser && (onRegenerate || (!isStreaming && content));
  const hasAttachments = message.fileIds && message.fileIds.length > 0;
  const modelName = message.model;
  const hasThinking = thinking.length > 0;
  const activeToolCall = message.parts?.find(
    (p) => p.type === "tool-invocation" && p.state === "call"
  );
  const sources = isUser ? [] : extractSources(message.parts);
  const statsLine = !isUser && showTokenStats ? formatTokenStats(message.metadata?.stats) : "";
  const toolErrors = isUser
    ? []
    : message.parts?.filter(
        (p) => p.type === "tool-invocation" && p.state === "result" && p.result?.error
      ) || [];

  async function copyResponse() {
    try {
      await navigator.clipboard.writeText(content);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy response");
    }
  }

  return (
    <div className={`mb-8 flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`flex min-w-0 gap-4 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
        {!isUser && <ModelAvatar modelId={modelName} />}

        <div
          className={`relative min-w-0 overflow-hidden p-3 leading-relaxed transition-all duration-300 ease-in-out ${
            isUser
              ? "bg-theme-surface-stronger text-theme-text rounded-tl-lg rounded-br-lg rounded-bl-lg bg-gradient-to-br"
              : "text-theme-text pt-0"
          } `}
          style={{ boxShadow: "var(--shadow-depth-sm)" }}>
          {!isUser && modelName && (
            <div className="mb-4">
              <span className="text-theme-text text-lg font-bold">{modelName}</span>
            </div>
          )}

          {hasAttachments && (
            <div className="mb-3 flex flex-wrap gap-2">
              {message.fileIds.map((fileId) => (
                <MessageAttachment key={fileId} fileId={fileId} />
              ))}
            </div>
          )}

          {!isUser && message.metadata?.generatedFileDownloadFailed && (
            <p role="status" className="text-theme-text-muted mb-3 text-sm">
              Some generated files could not be saved. Ask the model to generate them again.
            </p>
          )}

          {hasThinking && (
            <div className="mb-4">
              {thinking.map((thinkContent, index) => (
                <details
                  key={index}
                  className="bg-theme-surface/50 border-theme-border/50 group rounded-lg border">
                  <summary className="text-theme-text-muted hover:text-theme-text flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium transition-colors select-none">
                    <Brain className="text-theme-mauve h-4 w-4 flex-shrink-0" />
                    <span>Reasoning</span>
                    <ChevronRight className="h-4 w-4 shrink-0 transform-gpu transition-transform group-open:rotate-90" />
                  </summary>
                  <div className="text-theme-text-muted border-theme-border/50 border-t px-3 py-3 text-sm">
                    <MarkdownContent content={thinkContent} />
                  </div>
                </details>
              ))}
            </div>
          )}

          {toolErrors.length > 0 && (
            <div className="mb-3 space-y-2">
              {toolErrors.map((err, i) => (
                <div
                  key={i}
                  role="alert"
                  className="bg-theme-red/8 border-theme-red/20 text-theme-red flex items-start gap-2 rounded-lg border px-3 py-2 text-xs">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span>{TOOL_ERROR_MESSAGES[err.result.code] || err.result.error}</span>
                </div>
              ))}
            </div>
          )}

          {!isUser && (summaries.length > 0 || tools.length > 0) && (
            <div className="text-theme-text-muted mb-4 space-y-2 text-sm">
              {summaries.map((part, index) => {
                const heading = part.text.match(/^\s*\*\*(.+?)\*\*[ \t]*(?:\r?\n|$)/);
                return (
                  <details key={index} className="group">
                    <summary className="text-theme-text flex cursor-pointer list-none items-center gap-2 font-semibold [&::-webkit-details-marker]:hidden">
                      <span>{heading?.[1] ?? "Reasoning"}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 transform-gpu transition-transform duration-150 group-open:rotate-90" />
                    </summary>
                    <div className="mt-2">
                      <MarkdownContent
                        content={heading ? part.text.slice(heading[0].length).trim() : part.text}
                      />
                    </div>
                  </details>
                );
              })}
              {tools.map((part) => {
                const { Icon, label, done } = nativeTools[part.type];
                return (
                  <div key={part.toolCallId} className="flex items-center gap-2">
                    <Icon size={15} />
                    {part.state === "output-available"
                      ? done
                      : part.state === "output-error"
                        ? "Tool failed"
                        : label}
                  </div>
                );
              })}
            </div>
          )}

          <div
            data-chat-message-text
            className={isUser ? "max-h-[60vh] overflow-y-auto font-medium" : ""}>
            <MarkdownContent content={content} />
          </div>

          {sources.length > 0 && <SourceCitations sources={sources} />}

          {statsLine && (
            <p className="text-theme-text-muted mt-3 text-xs opacity-60">{statsLine}</p>
          )}

          {showActions && (
            <div className="mt-4 flex justify-start gap-2">
              {!isStreaming && content && (
                <button
                  type="button"
                  onClick={copyResponse}
                  aria-label="Copy response"
                  title="Copy response"
                  className={actionClass}>
                  <Copy size={16} />
                </button>
              )}
              {onRegenerate && !isStreaming && (
                <Menu>
                  <MenuButton aria-label="More response actions" className={actionClass}>
                    <MoreHorizontal size={16} />
                  </MenuButton>
                  <MenuItems
                    anchor="bottom start"
                    className="bg-theme-surface text-theme-text border-theme-border z-50 rounded-xl border p-1 shadow-lg [--anchor-gap:4px]">
                    <MenuItem
                      as="button"
                      onClick={onRegenerate}
                      className="data-[focus]:bg-theme-surface-strong flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
                      <RotateCw size={16} /> Regenerate response
                    </MenuItem>
                  </MenuItems>
                </Menu>
              )}
            </div>
          )}

          {isStreaming && !activeToolCall && !summaries.length && !tools.length && (
            <div className="text-theme-mauve mt-3 flex transform-gpu animate-pulse items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-medium">Processing...</span>
            </div>
          )}
          {activeToolCall && (
            <SearchStatus toolName={activeToolCall.toolName} args={activeToolCall.args} />
          )}
        </div>
      </div>
    </div>
  );
});

export default MessageItem;
