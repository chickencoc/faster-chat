import { useState } from "preact/hooks";
import { useMutation } from "@tanstack/react-query";
import { Pencil } from "lucide-preact";
import Modal from "@/components/ui/Modal";
import { authClient } from "@/lib/authClient";
import { useAuthState } from "@/state/useAuthState";

export default function AccountEmail({ email }) {
  const [draft, setDraft] = useState(null);
  const mutation = useMutation({
    mutationFn: (value) => authClient.updateEmail(value),
    onSuccess: ({ user }) => {
      const session = useAuthState.getState();
      if (session.user?.id === user.id) session.setUser(user);
      setDraft(null);
    },
  });

  function close() {
    if (!mutation.isPending) setDraft(null);
  }

  function submit(event) {
    event.preventDefault();
    if (!mutation.isPending) mutation.mutate(draft.trim());
  }

  return (
    <div className="min-w-0">
      <div className="text-theme-text-muted flex items-center gap-1 text-sm font-medium">
        <span>Email</span>
        <button
          type="button"
          aria-label="Edit email"
          title="Edit email"
          className="hover:bg-theme-surface hover:text-theme-text rounded-md p-1"
          onClick={() => {
            mutation.reset();
            setDraft(email ?? "");
          }}>
          <Pencil size={14} />
        </button>
      </div>
      <p className="text-theme-text mt-1 break-words">{email || "Not set"}</p>
      {draft !== null && (
        <Modal title="Edit email" onClose={close}>
          <form onSubmit={submit} className="space-y-3">
            <label htmlFor="account-email" className="text-theme-text text-sm font-medium">
              Email address
            </label>
            <input
              id="account-email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              disabled={mutation.isPending}
              value={draft}
              onInput={(event) => setDraft(event.currentTarget.value)}
              className="border-theme-border bg-theme-canvas text-theme-text focus:ring-theme-primary w-full rounded-lg border px-3 py-2 focus:ring-1 focus:outline-none"
            />
            {mutation.error && (
              <p role="alert" className="text-theme-red text-sm">
                {mutation.error.message}
              </p>
            )}
            <div className="flex justify-end">
              <button type="submit" disabled={mutation.isPending} className="btn btn-primary">
                {mutation.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
