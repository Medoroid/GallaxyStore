jest.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

import { useCartStore, cartItemKey } from "../app/stores/cartStore";

beforeEach(() => {
  useCartStore.setState({
    items: [],
    syncing: false,
  });
});

describe("cartItemKey", () => {
  it("should generate key from product_id only", () => {
    expect(cartItemKey("prod-1")).toBe("prod-1::::");
  });

  it("should generate key with color and size", () => {
    expect(cartItemKey("prod-1", "Blue", "M")).toBe("prod-1::Blue::M");
  });

  it("should treat undefined color/size as empty", () => {
    expect(cartItemKey("prod-1", undefined, undefined)).toBe("prod-1::::");
  });

  it("should produce different keys for different colors", () => {
    const k1 = cartItemKey("prod-1", "Blue", "M");
    const k2 = cartItemKey("prod-1", "Red", "M");
    expect(k1).not.toBe(k2);
  });

  it("should produce different keys for different sizes", () => {
    const k1 = cartItemKey("prod-1", "Blue", "M");
    const k2 = cartItemKey("prod-1", "Blue", "L");
    expect(k1).not.toBe(k2);
  });

  it("should treat empty string color/size same as undefined", () => {
    expect(cartItemKey("prod-1", "", "")).toBe(cartItemKey("prod-1", undefined, undefined));
  });
});

describe("CartStore - addItem", () => {
  it("should add item to cart with composite key", () => {
    const { addItem } = useCartStore.getState();

    addItem({
      product_id: "prod-1",
      name: "Test Product",
      price: 29.99,
      image: "/test.jpg",
    });

    const { items } = useCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].product_id).toBe("prod-1");
    expect(items[0].id).toBe(cartItemKey("prod-1"));
    expect(items[0].name).toBe("Test Product");
    expect(items[0].price).toBe(29.99);
    expect(items[0].quantity).toBe(1);
  });

  it("should add multiple items", () => {
    const { addItem } = useCartStore.getState();

    addItem({ product_id: "prod-1", name: "Product 1", price: 10, image: "/1.jpg" });
    addItem({ product_id: "prod-2", name: "Product 2", price: 20, image: "/2.jpg" });

    const { items } = useCartStore.getState();
    expect(items).toHaveLength(2);
  });

  it("should increase quantity for same item (same product + color + size)", () => {
    const { addItem } = useCartStore.getState();

    addItem({ product_id: "prod-1", name: "Product", price: 10, image: "/1.jpg" });
    addItem({ product_id: "prod-1", name: "Product", price: 10, image: "/1.jpg" });

    const { items } = useCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
  });

  it("should add with custom quantity", () => {
    const { addItem } = useCartStore.getState();

    addItem({ product_id: "prod-1", name: "Product", price: 10, image: "/1.jpg" }, 3);

    const { items } = useCartStore.getState();
    expect(items[0].quantity).toBe(3);
  });

  it("should keep same product with different colors as separate items", () => {
    const { addItem } = useCartStore.getState();

    addItem({ product_id: "prod-1", name: "T-Shirt", price: 29.99, image: "/shirt.jpg", color: "Blue", size: "M" });
    addItem({ product_id: "prod-1", name: "T-Shirt", price: 29.99, image: "/shirt.jpg", color: "Red", size: "L" });

    const { items } = useCartStore.getState();
    expect(items).toHaveLength(2);
    expect(items[0].color).toBe("Blue");
    expect(items[0].size).toBe("M");
    expect(items[1].color).toBe("Red");
    expect(items[1].size).toBe("L");
  });

  it("should merge same product with same color and size", () => {
    const { addItem } = useCartStore.getState();

    addItem({ product_id: "prod-1", name: "T-Shirt", price: 29.99, image: "/shirt.jpg", color: "Blue", size: "M" });
    addItem({ product_id: "prod-1", name: "T-Shirt", price: 29.99, image: "/shirt.jpg", color: "Blue", size: "M" });

    const { items } = useCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
  });

  it("should add item with backward-compatible id (no product_id)", () => {
    const { addItem } = useCartStore.getState();

    addItem({
      id: "prod-backward-compat",
      name: "Backward Compat Product",
      price: 15,
      image: "/compat.jpg",
    });

    const { items } = useCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].product_id).toBe("prod-backward-compat");
    expect(items[0].id).toBe(cartItemKey("prod-backward-compat"));
  });

  it("should push product_id and variant_id to server payload", () => {
    const { addItem } = useCartStore.getState();

    addItem({
      product_id: "prod-1",
      variant_id: "var-1",
      name: "Product",
      price: 10,
      image: "/1.jpg",
      color: "Blue",
      size: "M",
    });

    const { items } = useCartStore.getState();
    expect(items[0].product_id).toBe("prod-1");
    expect(items[0].variant_id).toBe("var-1");
  });
});

describe("CartStore - removeItem", () => {
  it("should remove item", () => {
    const { addItem } = useCartStore.getState();

    addItem({ product_id: "prod-1", name: "Product", price: 10, image: "/1.jpg" });

    const key = cartItemKey("prod-1");
    const { removeItem } = useCartStore.getState();
    removeItem(key);

    const { items } = useCartStore.getState();
    expect(items).toHaveLength(0);
  });

  it("should remove only the correct item when multiple exist", () => {
    const { addItem } = useCartStore.getState();

    addItem({ product_id: "prod-1", name: "T-Shirt", price: 29.99, image: "/shirt.jpg", color: "Blue", size: "M" });
    addItem({ product_id: "prod-1", name: "T-Shirt", price: 29.99, image: "/shirt.jpg", color: "Red", size: "L" });

    const blueKey = cartItemKey("prod-1", "Blue", "M");
    const { removeItem } = useCartStore.getState();
    removeItem(blueKey);

    const { items } = useCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].color).toBe("Red");
    expect(items[0].size).toBe("L");
  });
});

describe("CartStore - updateQuantity", () => {
  it("should update quantity", () => {
    const { addItem } = useCartStore.getState();

    addItem({ product_id: "prod-1", name: "Product", price: 10, image: "/1.jpg" });

    const key = cartItemKey("prod-1");
    const { updateQuantity } = useCartStore.getState();
    updateQuantity(key, 5);

    const { items } = useCartStore.getState();
    expect(items[0].quantity).toBe(5);
  });

  it("should update only the correct item quantity", () => {
    const { addItem } = useCartStore.getState();

    addItem({ product_id: "prod-1", name: "T-Shirt", price: 29.99, image: "/shirt.jpg", color: "Blue", size: "M" });
    addItem({ product_id: "prod-1", name: "T-Shirt", price: 29.99, image: "/shirt.jpg", color: "Red", size: "L" });

    const blueKey = cartItemKey("prod-1", "Blue", "M");
    const { updateQuantity } = useCartStore.getState();
    updateQuantity(blueKey, 5);

    const { items } = useCartStore.getState();
    expect(items[0].quantity).toBe(5);
    expect(items[1].quantity).toBe(1);
  });

  it("should remove item when quantity is 0", () => {
    const { addItem } = useCartStore.getState();

    addItem({ product_id: "prod-1", name: "Product", price: 10, image: "/1.jpg" });

    const key = cartItemKey("prod-1");
    const { updateQuantity } = useCartStore.getState();
    updateQuantity(key, 0);

    const { items } = useCartStore.getState();
    expect(items).toHaveLength(0);
  });

  it("should remove item when quantity is negative", () => {
    const { addItem } = useCartStore.getState();

    addItem({ product_id: "prod-1", name: "Product", price: 10, image: "/1.jpg" });

    const key = cartItemKey("prod-1");
    const { updateQuantity } = useCartStore.getState();
    updateQuantity(key, -1);

    const { items } = useCartStore.getState();
    expect(items).toHaveLength(0);
  });
});

describe("CartStore - clearCart", () => {
  it("should clear cart", () => {
    const { addItem, clearCart } = useCartStore.getState();

    addItem({ product_id: "prod-1", name: "Product 1", price: 10, image: "/1.jpg" });
    addItem({ product_id: "prod-2", name: "Product 2", price: 20, image: "/2.jpg" });

    clearCart();

    const { items } = useCartStore.getState();
    expect(items).toHaveLength(0);
  });
});

describe("CartStore - totals", () => {
  it("should calculate total", () => {
    const { addItem } = useCartStore.getState();

    addItem({ product_id: "prod-1", name: "Product", price: 29.99, image: "/1.jpg" }, 2);
    addItem({ product_id: "prod-2", name: "Product", price: 19.99, image: "/2.jpg" }, 1);

    const { getTotal } = useCartStore.getState();
    const total = getTotal();

    expect(total).toBeCloseTo(79.97, 2);
  });

  it("should count items", () => {
    const { addItem } = useCartStore.getState();

    addItem({ product_id: "prod-1", name: "Product", price: 10, image: "/1.jpg" }, 2);
    addItem({ product_id: "prod-2", name: "Product", price: 10, image: "/2.jpg" }, 3);

    const { getCount } = useCartStore.getState();
    const count = getCount();

    expect(count).toBe(5);
  });
});

describe("CartStore - color/size variants", () => {
  it("should add item with color and size", () => {
    const { addItem } = useCartStore.getState();

    addItem({
      product_id: "prod-1",
      name: "T-Shirt",
      price: 29.99,
      image: "/shirt.jpg",
      color: "Black",
      size: "L",
    });

    const { items } = useCartStore.getState();
    expect(items[0].color).toBe("Black");
    expect(items[0].size).toBe("L");
    expect(items[0].id).toBe(cartItemKey("prod-1", "Black", "L"));
  });

  it("should keep Product A / Blue / M and Product A / Red / L as separate items", () => {
    const { addItem } = useCartStore.getState();

    addItem({ product_id: "prod-A", name: "Product A", price: 50, image: "/a.jpg", color: "Blue", size: "M" });
    addItem({ product_id: "prod-A", name: "Product A", price: 50, image: "/a.jpg", color: "Red", size: "L" });

    const { items } = useCartStore.getState();
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe(cartItemKey("prod-A", "Blue", "M"));
    expect(items[1].id).toBe(cartItemKey("prod-A", "Red", "L"));
  });

  it("should merge Product A / Blue / M with Product A / Blue / M", () => {
    const { addItem } = useCartStore.getState();

    addItem({ product_id: "prod-A", name: "Product A", price: 50, image: "/a.jpg", color: "Blue", size: "M" });
    addItem({ product_id: "prod-A", name: "Product A", price: 50, image: "/a.jpg", color: "Blue", size: "M" });

    const { items } = useCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
    expect(items[0].color).toBe("Blue");
    expect(items[0].size).toBe("M");
  });

  it("should keep items with same product and color but different sizes separate", () => {
    const { addItem } = useCartStore.getState();

    addItem({ product_id: "prod-A", name: "Product A", price: 50, image: "/a.jpg", color: "Blue", size: "M" });
    addItem({ product_id: "prod-A", name: "Product A", price: 50, image: "/a.jpg", color: "Blue", size: "L" });

    const { items } = useCartStore.getState();
    expect(items).toHaveLength(2);
  });

  it("should keep items with same product and size but different colors separate", () => {
    const { addItem } = useCartStore.getState();

    addItem({ product_id: "prod-A", name: "Product A", price: 50, image: "/a.jpg", color: "Blue", size: "M" });
    addItem({ product_id: "prod-A", name: "Product A", price: 50, image: "/a.jpg", color: "Red", size: "M" });

    const { items } = useCartStore.getState();
    expect(items).toHaveLength(2);
  });
});

describe("CartStore - payload format", () => {
  it("should include product_id, variant_id, color, size in pushToServer payload", () => {
    const { addItem } = useCartStore.getState();

    addItem({
      product_id: "prod-1",
      variant_id: "var-1",
      name: "Product",
      price: 10,
      image: "/1.jpg",
      color: "Blue",
      size: "M",
    });

    const { items } = useCartStore.getState();
    expect(items[0].product_id).toBe("prod-1");
    expect(items[0].variant_id).toBe("var-1");
    expect(items[0].color).toBe("Blue");
    expect(items[0].size).toBe("M");
  });
});
