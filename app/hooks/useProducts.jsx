import { useQuery } from "@tanstack/react-query";
import fetchProducts from "./query";

function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: fetchProducts,
    staleTime: 1000 * 60 * 10, // 10 minutes
    retry: false,
  })
}

export default useProducts

