import { create } from "zustand";

export const MAX_CHAT_QUOTES = 5;

export const useChatQuote = create((set) => ({
  quote: null,
  addQuote: (chatId, text) =>
    set((state) => {
      const items = state.quote?.chatId === chatId ? state.quote.items : [];
      if (items.length >= MAX_CHAT_QUOTES) {
        return state;
      }
      return { quote: { chatId, items: [...items, { id: crypto.randomUUID(), text }] } };
    }),
  removeQuote: (chatId, id) =>
    set((state) => {
      if (state.quote?.chatId !== chatId) {
        return state;
      }
      const items = state.quote.items.filter((item) => item.id !== id);
      return { quote: items.length ? { chatId, items } : null };
    }),
  clearQuote: (chatId) =>
    set((state) => (state.quote?.chatId === chatId ? { quote: null } : state)),
}));
