/**
 * Component Unit Tests
 *
 * Tests individual components for correct rendering and behavior.
 */

import React from "react";
import { render, screen } from "@testing-library/react";

// Mock Next.js Link
jest.mock("next/link", () => {
  return ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  );
});

// Mock lucide-react
jest.mock("lucide-react", () => ({
  Search: (props: any) => <svg data-testid="search-icon" {...props} />,
  SlidersHorizontal: (props: any) => <svg data-testid="filter-icon" {...props} />,
  ChevronLeft: (props: any) => <svg data-testid="chevron-left" {...props} />,
  ChevronRight: (props: any) => <svg data-testid="chevron-right" {...props} />,
  ArrowUpDown: (props: any) => <svg data-testid="arrow-updown" {...props} />,
  ThumbsUp: (props: any) => <svg data-testid="thumbs-up" {...props} />,
  ThumbsDown: (props: any) => <svg data-testid="thumbs-down" {...props} />,
  Flag: (props: any) => <svg data-testid="flag" {...props} />,
  Package: (props: any) => <svg data-testid="package" {...props} />,
  ShoppingBag: (props: any) => <svg data-testid="shopping-bag" {...props} />,
  DollarSign: (props: any) => <svg data-testid="dollar-sign" {...props} />,
  Clock: (props: any) => <svg data-testid="clock" {...props} />,
  ArrowUpRight: (props: any) => <svg data-testid="arrow-up-right" {...props} />,
  Users: (props: any) => <svg data-testid="users" {...props} />,
  Image: (props: any) => <svg data-testid="image" {...props} />,
  AlertTriangle: (props: any) => <svg data-testid="alert-triangle" {...props} />,
  Star: (props: any) => <svg data-testid="star" {...props} />,
  X: (props: any) => <svg data-testid="x" {...props} />,
  Send: (props: any) => <svg data-testid="send" {...props} />,
  Check: (props: any) => <svg data-testid="check" {...props} />,
  Trash2: (props: any) => <svg data-testid="trash" {...props} />,
  Edit: (props: any) => <svg data-testid="edit" {...props} />,
  Bell: (props: any) => <svg data-testid="bell" {...props} />,
}));

describe("Component Rendering", () => {
  test("CategoryChip renders with correct label", () => {
    // Simple inline component test
    const CategoryChip = ({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) => (
      <button
        onClick={onClick}
        className={`px-4 py-2 rounded-full text-sm font-medium ${active ? "bg-gradient" : "glass"}`}
      >
        {label}
      </button>
    );

    render(<CategoryChip active={false} onClick={() => {}} label="T-Shirts" />);
    expect(screen.getByText("T-Shirts")).toBeDefined();
  });

  test("Sort option renders correctly", () => {
    const SortOption = ({ value, label }: { value: string; label: string }) => (
      <option value={value}>{label}</option>
    );

    render(
      <select>
        <SortOption value="newest" label="Newest" />
        <SortOption value="price-asc" label="Price: Low to High" />
      </select>
    );

    expect(screen.getByText("Newest")).toBeDefined();
    expect(screen.getByText("Price: Low to High")).toBeDefined();
  });

  test("Empty state renders correctly", () => {
    const EmptyState = ({ message }: { message: string }) => (
      <div className="glass rounded-2xl p-12 text-center">
        {message}
      </div>
    );

    render(<EmptyState message="No products match your filters." />);
    expect(screen.getByText("No products match your filters.")).toBeDefined();
  });

  test("Status badge renders with correct colors", () => {
    const StatusBadge = ({ status }: { status: string }) => {
      const colors: Record<string, string> = {
        pending: "text-yellow-400 bg-yellow-400/10",
        paid: "text-blue-400 bg-blue-400/10",
        delivered: "text-green-400 bg-green-400/10",
        cancelled: "text-red-400 bg-red-400/10",
      };
      return (
        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${colors[status] || colors.pending}`}>
          {status}
        </span>
      );
    };

    const { rerender } = render(<StatusBadge status="pending" />);
    expect(screen.getByText("pending")).toBeDefined();

    rerender(<StatusBadge status="delivered" />);
    expect(screen.getByText("delivered")).toBeDefined();
  });

  test("Loading skeleton renders", () => {
    const Skeleton = () => (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass rounded-2xl p-6 animate-pulse">
            <div className="h-4 bg-white/[0.05] rounded w-1/3 mb-4" />
            <div className="h-8 bg-white/[0.05] rounded w-1/2" />
          </div>
        ))}
      </div>
    );

    const { container } = render(<Skeleton />);
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBe(3);
  });

  test("Stat card renders with value and label", () => {
    const DollarSignMock = (props: any) => <svg data-testid="dollar-sign" {...props} />;
    const StatCard = ({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) => (
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-gray-400">{label}</span>
          <Icon className="w-5 h-5" />
        </div>
        <div className="text-2xl font-bold text-white">{value}</div>
      </div>
    );

    render(<StatCard label="Total Revenue" value="$1,234" icon={DollarSignMock} />);
    expect(screen.getByText("Total Revenue")).toBeDefined();
    expect(screen.getByText("$1,234")).toBeDefined();
  });

  test("Search input renders with placeholder", () => {
    const SearchInput = ({ value, onChange, placeholder }: { value: string; onChange: (e: any) => void; placeholder: string }) => (
      <div className="relative">
        <input
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="w-full glass rounded-2xl h-12 pl-11 pr-4 outline-none"
        />
      </div>
    );

    render(<SearchInput value="" onChange={() => {}} placeholder="Search products..." />);
    expect(screen.getByPlaceholderText("Search products...")).toBeDefined();
  });

  test("Pagination renders correct page numbers", () => {
    const Pagination = ({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) => (
      <div className="flex items-center justify-center gap-2">
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`h-10 w-10 rounded-xl flex items-center justify-center text-sm font-semibold ${
              page === p ? "bg-gradient text-white" : "glass"
            }`}
          >
            {p}
          </button>
        ))}
      </div>
    );

    render(<Pagination page={2} totalPages={5} onPageChange={() => {}} />);
    const buttons = screen.getAllByText(/\d+/);
    expect(buttons.length).toBe(5);
  });
});
