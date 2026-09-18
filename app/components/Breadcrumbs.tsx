"use client";

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

type BreadcrumbItem = {
  label: string;
  href?: string;
};

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-gray-400 mb-6">
      <Link
        href="/"
        className="hover:text-[#FF4FD8] transition-colors flex items-center gap-1"
      >
        <Home className="w-4 h-4" />
        <span>Home</span>
      </Link>
      {items.map((item, index) => (
        <span key={index} className="flex items-center gap-2">
          <ChevronRight className="w-4 h-4" />
          {item.href ? (
            <Link href={item.href} className="hover:text-[#FF4FD8] transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-white">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
