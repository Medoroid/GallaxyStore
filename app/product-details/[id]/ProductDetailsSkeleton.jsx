function SkeletonBlock({ className = "" }) {
  return <div className={`animate-pulse rounded-2xl bg-white/10 ${className}`} />;
}

export default function ProductDetailsSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-24 pb-20" dir="rtl" aria-busy="true">
      <div className="mb-8 flex gap-2">
        <SkeletonBlock className="h-4 w-16" />
        <SkeletonBlock className="h-4 w-20" />
        <SkeletonBlock className="h-4 w-32" />
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        <div className="space-y-4">
          <SkeletonBlock className="aspect-square w-full rounded-3xl" />
          <div className="grid grid-cols-5 gap-3">
            {[0, 1, 2, 3, 4].map((item) => (
              <SkeletonBlock key={item} className="aspect-square rounded-2xl" />
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <SkeletonBlock className="h-4 w-56" />
            <SkeletonBlock className="h-12 w-4/5" />
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-2/3" />
          </div>

          <SkeletonBlock className="h-24 w-full" />
          <div className="space-y-3">
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-5/6" />
            <SkeletonBlock className="h-4 w-2/3" />
          </div>

          <div className="space-y-3">
            <SkeletonBlock className="h-4 w-28" />
            <div className="flex gap-3">
              {[0, 1, 2, 3].map((item) => (
                <SkeletonBlock key={item} className="h-10 w-10 rounded-full" />
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <SkeletonBlock key={item} className="h-16" />
            ))}
          </div>

          <div className="flex gap-3">
            <SkeletonBlock className="h-14 w-32" />
            <SkeletonBlock className="h-14 flex-1" />
            <SkeletonBlock className="h-14 w-14" />
          </div>
        </div>
      </div>
    </div>
  );
}
