"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import { ProductCard, type ProductCardProduct } from "./ProductCard";

import "swiper/css";

interface FeaturedDropsSliderProps {
  products: ProductCardProduct[];
  isLoading?: boolean;
  error?: unknown;
}

export function FeaturedDropsSlider({ products, isLoading, error }: FeaturedDropsSliderProps) {
  const swiperRef = useRef<SwiperType | null>(null);

  if (isLoading) {
    return (
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass rounded-2xl sm:rounded-3xl p-3 aspect-[3/4] animate-pulse">
            <div className="aspect-square rounded-xl sm:rounded-2xl bg-white/5 mb-3" />
            <div className="h-4 bg-white/5 rounded w-3/4 mb-2" />
            <div className="h-4 bg-white/5 rounded w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6 glass rounded-2xl p-6 text-sm text-red-400 text-center">
        Unable to load products.
      </div>
    );
  }

  if (!products || products.length === 0) {
    return null;
  }

  return (
    <div className="relative mt-4">
      {/* Navigation Controls positioned next to or above the slider */}
      <div className="flex items-center justify-end gap-2 mb-3 -mt-12 sm:-mt-14">
        <button
          onClick={() => swiperRef.current?.slidePrev()}
          className="h-9 w-9 rounded-xl glass hover:pink-glow flex items-center justify-center transition-all text-white/80 hover:text-white active:scale-95 shadow-md"
          aria-label="Previous slide"
        >
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        </button>
        <button
          onClick={() => swiperRef.current?.slideNext()}
          className="h-9 w-9 rounded-xl glass hover:pink-glow flex items-center justify-center transition-all text-white/80 hover:text-white active:scale-95 shadow-md"
          aria-label="Next slide"
        >
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </button>
      </div>

      <Swiper
        onSwiper={(swiper) => {
          swiperRef.current = swiper;
        }}
        modules={[Autoplay]}
        autoplay={{
          delay: 3200,
          disableOnInteraction: false,
          pauseOnMouseEnter: true,
        }}
        loop={products.length > 4}
        grabCursor={true}
        slidesPerView={2}
        spaceBetween={12}
        breakpoints={{
          640: {
            slidesPerView: 2.5,
            spaceBetween: 14,
          },
          768: {
            slidesPerView: 3,
            spaceBetween: 16,
          },
          1024: {
            slidesPerView: 4,
            spaceBetween: 20,
          },
        }}
        className="!py-3 !px-1"
      >
        {products.map((p, idx) => (
          <SwiperSlide key={`${p.id}-${idx}`} className="!h-auto flex">
            <div className="w-full h-full">
              <ProductCard product={p} href={`/product-details/${p.id}`} />
            </div>
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}
