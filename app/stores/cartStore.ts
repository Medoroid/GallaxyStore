import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabase } from "@/lib/supabaseClient";

export type CartItem = {
  id: string;
  product_id: string;
  variant_id?: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
  color?: string;
  size?: string;
};

type AddCartItemInput = Omit<CartItem, "quantity" | "id" | "product_id"> & { id?: string; product_id?: string };

type CartStore = {
  items: CartItem[];
  loading: boolean;
  syncing: boolean;
  addItem: (item: AddCartItemInput, quantity?: number) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  clearLocalCart: () => void;
  getTotal: () => number;
  getCount: () => number;
  syncWithServer: (token: string) => Promise<void>;
  pushToServer: (token: string) => Promise<void>;
};

export function cartItemKey(productId: string, color?: string, size?: string): string {
  return [productId, color ?? "", size ?? ""].join("::");
}

async function getToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      loading: false,
      syncing: false,

      addItem: (item, quantity = 1) => {
        set((state) => {
          const productId = item.product_id ?? item.id ?? "";
          const key = cartItemKey(productId, item.color, item.size);

          const existing = state.items.find((i) => i.id === key);
          const newItems = existing
            ? state.items.map((i) =>
                i.id === key ? { ...i, quantity: i.quantity + quantity } : i
              )
            : [
                ...state.items,
                {
                  id: key,
                  product_id: productId,
                  variant_id: item.variant_id,
                  name: item.name,
                  price: item.price,
                  image: item.image,
                  quantity,
                  color: item.color,
                  size: item.size,
                },
              ];

          getToken().then((token) => {
            if (token) get().pushToServer(token);
          });

          return { items: newItems };
        });
      },

      removeItem: (id) => {
        set((state) => {
          const newItems = state.items.filter((i) => i.id !== id);

          getToken().then((token) => {
            if (token) get().pushToServer(token);
          });

          return { items: newItems };
        });
      },

      updateQuantity: (id, quantity) => {
        set((state) => {
          if (quantity <= 0) {
            const newItems = state.items.filter((i) => i.id !== id);
            getToken().then((token) => {
              if (token) get().pushToServer(token);
            });
            return { items: newItems };
          }

          const newItems = state.items.map((i) =>
            i.id === id ? { ...i, quantity } : i
          );

          getToken().then((token) => {
            if (token) get().pushToServer(token);
          });

          return { items: newItems };
        });
      },

      clearCart: () => {
        set({ items: [] });

        getToken().then((token) => {
          if (token) {
            fetch("/api/cart", {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            });
          }
        });
      },

      clearLocalCart: () => {
        set({ items: [] });
      },

      getTotal: () =>
        get().items.reduce((sum, item) => sum + item.price * item.quantity, 0),

      getCount: () =>
        get().items.reduce((sum, item) => sum + item.quantity, 0),

      syncWithServer: async (token) => {
        set({ loading: true });
        try {
          const res = await fetch("/api/cart", {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json();

          if (data.success && data.items) {
            const serverItems: CartItem[] = data.items.map(
              (item: Record<string, unknown>) => {
                const pid = String(item.product_id || "");
                const vid = item.variant_id ? String(item.variant_id) : undefined;
                const color = typeof item.color === "string" && item.color ? item.color : undefined;
                const size = typeof item.size === "string" && item.size ? item.size : undefined;
                return {
                  id: cartItemKey(pid, color, size),
                  product_id: pid,
                  variant_id: vid,
                  name: String(item.product_name || item.sku || "Item"),
                  price: Number(item.price || item.unit_price_snapshot || 0),
                  image: String(item.product_image || ""),
                  quantity: Number(item.quantity || 1),
                  color,
                  size,
                };
              }
            );

            const localItems = get().items;
            const serverKeys = new Set(serverItems.map((i) => i.id));
            const localOnly = localItems.filter((i) => !serverKeys.has(i.id));

            set({ items: [...serverItems, ...localOnly], loading: false });
            get().pushToServer(token);
          }
        } catch {
          set({ loading: false });
        }
      },

      pushToServer: async (token) => {
        set({ syncing: true });
        try {
          await fetch("/api/cart", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              items: get().items.map((i) => ({
                product_id: i.product_id,
                variant_id: i.variant_id,
                quantity: i.quantity,
                price: i.price,
                color: i.color,
                size: i.size,
              })),
            }),
          });
        } finally {
          set({ syncing: false });
        }
      },
    }),
    { name: "galaxy-cart" }
  )
);
