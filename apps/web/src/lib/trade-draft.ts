import { create } from "zustand";

export const useTradeDraft = create<{ amount: string; setAmount: (amount: string) => void }>((set) => ({
  amount: "10",
  setAmount: (amount) => set({ amount }),
}));
