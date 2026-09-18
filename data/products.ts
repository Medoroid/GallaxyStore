export type Product = {
  id: string | number;
  name: string;
  image: string;
  category: string;
  price: number;
  oldPrice?: number;
  badge?: string;
  rating: number;
};

export const products: Product[] = [
  { id: 1, name: "Neon Genesis Mug", image: "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=600&q=80", category: "Mugs", price: 15.99, badge: "Best Seller", rating: 4.8 },
  { id: 2, name: "Cyberpunk Tee", image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=600&q=80", category: "Apparel", price: 29.99, rating: 4.9 },
  { id: 3, name: "Retro Console Poster", image: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=600&q=80", category: "Art", price: 19.99, rating: 4.7 },
  { id: 4, name: "Galaxy Phone Case", image: "https://images.unsplash.com/photo-1541560052-5e137f229371?auto=format&fit=crop&w=600&q=80", category: "Accessories", price: 24.99, badge: "New", rating: 4.9 },
  { id: 5, name: "Anime Gift Box", image: "https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?auto=format&fit=crop&w=600&q=80", category: "Boxes", price: 49.99, rating: 5.0 },
  { id: 6, name: "Gamer Setup Bundle", image: "https://images.unsplash.com/photo-1593640408182-31c70c8268f5?auto=format&fit=crop&w=600&q=80", category: "Bundles", price: 89.99, oldPrice: 109.99, rating: 4.8 },
  { id: 7, name: "Neon Galaxy Frame", image: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=600&q=80", category: "Art", price: 34.99, badge: "New", rating: 4.7 },
  { id: 8, name: "Cosmic Hoodie", image: "https://images.unsplash.com/photo-1556821840-3a63f15732ce?auto=format&fit=crop&w=600&q=80", category: "Apparel", price: 54.99, oldPrice: 69.99, rating: 4.9 },
];

export const categories = [
  { id: 1, name: "Apparel", image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=300&q=80", count: 120 },
  { id: 2, name: "Mugs & Drinkware", image: "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=300&q=80", count: 45 },
  { id: 3, name: "Posters & Art", image: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=300&q=80", count: 85 },
  { id: 4, name: "Phone Cases", image: "https://images.unsplash.com/photo-1541560052-5e137f229371?auto=format&fit=crop&w=300&q=80", count: 210 },
  { id: 5, name: "Gift Boxes", image: "https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?auto=format&fit=crop&w=300&q=80", count: 15 },
  { id: 6, name: "Gaming Gear", image: "https://images.unsplash.com/photo-1593640408182-31c70c8268f5?auto=format&fit=crop&w=300&q=80", count: 60 },
  { id: 7, name: "Stickers", image: "https://images.unsplash.com/photo-1572375992501-4b0892d50c69?auto=format&fit=crop&w=300&q=80", count: 300 },
];

export const heroImg = "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1800&q=85";
