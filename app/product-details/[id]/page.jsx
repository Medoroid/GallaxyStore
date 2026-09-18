
import { Suspense } from "react";
import ProductDetailsClient from "./productDetailsClient";
import ProductDetailsSkeleton from "./ProductDetailsSkeleton";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { fetchProductById, fetchRelatedProducts } from "@/lib/products";

export default async function ProductDetailsPage({ params }) {
  const { id } = await params;
  const queryClient = new QueryClient();

  await queryClient.prefetchQuery({
    queryKey: ["singleProduct", id],
    queryFn: async () => {
      const product = await fetchProductById(String(id));
      const related = await fetchRelatedProducts(product, 4);

      return { product, related };
    },
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<ProductDetailsSkeleton />}>
        <ProductDetailsClient id={String(id)} />
      </Suspense>
    </HydrationBoundary>
  );
}
