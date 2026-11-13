import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MessageAttachment from "@/components/chat/MessageAttachment";

const fetchMock = vi.fn();

vi.mock("@/lib/api", () => ({
  API_BASE: "",
  apiFetch: (endpoint, options) => fetchMock(endpoint, options),
}));

vi.mock("@/lib/providersClient", () => ({
  providersClient: {
    getEnabledModelsByType: () =>
      Promise.resolve({
        models: [
          { model_id: "gpt-4o", display_name: "GPT-4o", metadata: { supports_vision: true } },
          { model_id: "llama-3", display_name: "Llama 3", metadata: { supports_vision: false } },
        ],
      }),
  },
}));

let mockSetPendingPrompt = null;
vi.mock("@/state/useUiState", () => ({
  useUiState: (selector) =>
    selector({
      setPendingPrompt: (text) => mockSetPendingPrompt(text),
      clearPendingPrompt: vi.fn(),
      pendingPrompt: null,
    }),
}));

function renderWithClient(ui) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

async function openPreview() {
  fireEvent.click(await screen.findByRole("button", { name: "Preview image: gen_1.png" }));
  return screen.findByRole("dialog", { name: "Image preview" });
}

describe("MessageAttachment - reverse prompt", () => {
  let resolveReversePrompt;

  afterEach(() => {
    cleanup();
    delete HTMLDialogElement.prototype.showModal;
    delete HTMLDialogElement.prototype.close;
  });

  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function () {
      this.open = false;
    };
    fetchMock.mockReset();
    mockSetPendingPrompt = vi.fn();
    resolveReversePrompt = null;
    fetchMock.mockImplementation((endpoint) => {
      if (endpoint === "/api/files/img-1") {
        return Promise.resolve({
          mimeType: "image/png",
          filename: "gen_1.png",
          size: 1024,
          sizeFormatted: "1 KB",
          meta: { type: "generated", prompt: "a red cube" },
        });
      }
      if (endpoint === "/api/images/reverse-prompt") {
        return new Promise((resolve) => {
          resolveReversePrompt = () => resolve({ prompt: "a red cube on a table, studio light" });
        });
      }
      throw new Error(`Unexpected endpoint: ${endpoint}`);
    });
  });

  test("opens a preview with prompt, original download and close controls", async () => {
    renderWithClient(<MessageAttachment fileId="img-1" />);
    await openPreview();
    expect(screen.getByRole("button", { name: "Generate image prompt" })).toBeTruthy();
    const download = screen.getByRole("link", { name: "Download image" });
    expect(download.getAttribute("download")).toBe("gen_1.png");
    expect(download.getAttribute("href")).toBe("/api/files/img-1/content");
    fireEvent.click(screen.getByRole("button", { name: "Close image preview" }));
    expect(screen.queryByRole("dialog", { name: "Image preview" })).toBeNull();
  });

  test("opens the result modal and shows a loading state while the mutation is pending", async () => {
    renderWithClient(<MessageAttachment fileId="img-1" />);
    await openPreview();
    fireEvent.click(screen.getByRole("button", { name: "Generate image prompt" }));

    expect(await screen.findByText("Analyzing image...")).toBeTruthy();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/images/reverse-prompt", expect.anything())
    );
    resolveReversePrompt();
    expect(await screen.findByText("a red cube on a table, studio light")).toBeTruthy();
  });

  test("Insert fills the composer via the pending prompt", async () => {
    renderWithClient(<MessageAttachment fileId="img-1" />);
    await openPreview();
    fireEvent.click(screen.getByRole("button", { name: "Generate image prompt" }));
    await screen.findByText("Analyzing image...");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/images/reverse-prompt", expect.anything())
    );
    resolveReversePrompt();

    fireEvent.click(await screen.findByRole("button", { name: "Insert into composer" }));
    expect(mockSetPendingPrompt).toHaveBeenCalledWith("a red cube on a table, studio light");
  });

  test("Copy puts the prompt on the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });

    renderWithClient(<MessageAttachment fileId="img-1" />);
    await openPreview();
    fireEvent.click(screen.getByRole("button", { name: "Generate image prompt" }));
    await screen.findByText("Analyzing image...");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/images/reverse-prompt", expect.anything())
    );
    resolveReversePrompt();

    fireEvent.click(await screen.findByRole("button", { name: "Copy prompt" }));
    expect(writeText).toHaveBeenCalledWith("a red cube on a table, studio light");
  });
});
