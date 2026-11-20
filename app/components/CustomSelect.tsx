"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

export interface Option {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
}

export function CustomSelect({
  value,
  onChange,
  options,
  placeholder = "Select...",
  className = "",
  id,
  disabled = false,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close on escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [open]);

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={`w-full h-11 px-4 rounded-xl glass flex items-center justify-between text-sm transition-all outline-none ${
          open ? "pink-glow border-pink-500/50" : "hover:border-white/20"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selectedOption ? "text-white font-medium truncate" : "text-muted-foreground truncate"}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0 ${
            open ? "rotate-180 text-pink-400" : ""
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {open && (
        <div
          role="listbox"
          className="absolute top-full left-0 right-0 mt-1.5 max-h-60 overflow-y-auto bg-[var(--bg-panel)]/98 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl p-1.5 z-50 animate-fade-in-up"
        >
          {placeholder && (
            <button
              type="button"
              onClick={() => handleSelect("")}
              className={`w-full px-3.5 py-2.5 rounded-xl text-sm flex items-center justify-between text-left transition-all ${
                !value
                  ? "bg-gradient-neon text-white font-semibold shadow-md"
                  : "text-muted-foreground hover:bg-white/10 hover:text-white"
              }`}
            >
              <span>{placeholder}</span>
              {!value && <Check className="h-4 w-4" />}
            </button>
          )}

          {options.map((option) => {
            const isSelected = value === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                role="option"
                aria-selected={isSelected}
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm flex items-center justify-between text-left transition-all ${
                  isSelected
                    ? "bg-gradient-neon text-white font-semibold shadow-md"
                    : "text-foreground/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span>{option.label}</span>
                {isSelected && <Check className="h-4 w-4" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

