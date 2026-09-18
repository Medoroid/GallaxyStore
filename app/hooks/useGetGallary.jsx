'use client'
import { useQuery } from '@tanstack/react-query';

async function fetchGallery() {
  const res = await fetch('/api/gallery');
  const data = await res.json();

  if (!data.success) {
    throw new Error(data.message || 'Failed to fetch gallery');
  }

  return data.images;
}

export default function useGetGallary() {
  return useQuery({
    queryKey: ['gallery'],
    queryFn: fetchGallery,
    staleTime: 1000 * 60 * 10,
  })
}
