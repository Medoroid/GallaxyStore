export function ProductCardSkeleton() {
  return (
    <div className="glass rounded-2xl overflow-hidden animate-pulse">
      <div className="aspect-square bg-white/[0.03]" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-white/[0.05] rounded w-3/4" />
        <div className="h-3 bg-white/[0.05] rounded w-1/2" />
        <div className="flex justify-between items-center">
          <div className="h-5 bg-white/[0.05] rounded w-1/4" />
          <div className="h-8 bg-white/[0.05] rounded w-1/3" />
        </div>
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function OrderCardSkeleton() {
  return (
    <div className="glass rounded-2xl p-6 animate-pulse">
      <div className="flex justify-between items-start mb-4">
        <div className="space-y-2">
          <div className="h-4 bg-white/[0.05] rounded w-32" />
          <div className="h-3 bg-white/[0.05] rounded w-24" />
        </div>
        <div className="h-6 bg-white/[0.05] rounded w-20" />
      </div>
      <div className="space-y-2">
        <div className="h-3 bg-white/[0.05] rounded w-full" />
        <div className="h-3 bg-white/[0.05] rounded w-2/3" />
      </div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="min-h-screen p-6 animate-pulse">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="h-8 bg-white/[0.05] rounded w-1/3" />
        <div className="h-4 bg-white/[0.05] rounded w-1/2" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 bg-white/[0.03] rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function TableRowSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4 animate-pulse">
      <div className="h-12 w-12 bg-white/[0.05] rounded-xl" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-white/[0.05] rounded w-1/3" />
        <div className="h-3 bg-white/[0.05] rounded w-1/4" />
      </div>
      <div className="h-6 bg-white/[0.05] rounded w-16" />
    </div>
  );
}
