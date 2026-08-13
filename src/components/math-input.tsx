"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Tex } from "./math";
import { cn } from "@/lib/utils";

const PALETTE: { label: string; insert: string; caret?: number }[] = [
  { label: "frac", insert: "\\dfrac{}{}", caret: 7 },
  { label: "√", insert: "\\sqrt{}", caret: 6 },
  { label: "xⁿ", insert: "^{}", caret: 2 },
  { label: "xₙ", insert: "_{}", caret: 2 },
  { label: "∫", insert: "\\int_{}^{}", caret: 6 },
  { label: "∑", insert: "\\sum_{}^{}", caret: 6 },
  { label: "lim", insert: "\\lim_{} ", caret: 6 },
  { label: "dy/dx", insert: "\\dfrac{dy}{dx}", caret: 0 },
  { label: "∂", insert: "\\partial ", caret: 0 },
  { label: "→", insert: "\\to ", caret: 0 },
  { label: "≤", insert: "\\le ", caret: 0 },
  { label: "≥", insert: "\\ge ", caret: 0 },
  { label: "±", insert: "\\pm ", caret: 0 },
  { label: "·", insert: "\\cdot ", caret: 0 },
  { label: "α", insert: "\\alpha ", caret: 0 },
  { label: "β", insert: "\\beta ", caret: 0 },
  { label: "γ", insert: "\\gamma ", caret: 0 },
  { label: "θ", insert: "\\theta ", caret: 0 },
  { label: "λ", insert: "\\lambda ", caret: 0 },
  { label: "μ", insert: "\\mu ", caret: 0 },
  { label: "π", insert: "\\pi ", caret: 0 },
  { label: "∞", insert: "\\infty", caret: 0 },
  { label: "eˣ", insert: "e^{}", caret: 3 },
  { label: "ln", insert: "\\ln ", caret: 0 },
  { label: "sin", insert: "\\sin ", caret: 0 },
  { label: "cos", insert: "\\cos ", caret: 0 },
  { label: "tan", insert: "\\tan ", caret: 0 },
];

export function MathInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Write your next step in LaTeX…  (or plain English)",
  disabled,
  autoFocus,
  className,
  submitLabel = "Submit step",
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  submitLabel?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const insert = useCallback(
    (token: string, caret?: number) => {
      const el = ref.current;
      if (!el) return;
      const start = el.selectionStart ?? value.length;
      const end = el.selectionEnd ?? value.length;
      const next = value.slice(0, start) + token + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        const pos = start + (caret ?? token.length);
        el.focus();
        el.setSelectionRange(pos, pos);
      });
    },
    [value, onChange]
  );

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onSubmit?.();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit?.();
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border bg-card transition-shadow",
        focused ? "border-primary/60 glow-ring" : "border-border",
        disabled && "opacity-60 pointer-events-none",
        className
      )}
    >
      {/* live preview */}
      <div className="min-h-[42px] px-3 pt-2.5 pb-1 flex items-center">
        {value.trim() ? (
          <Tex className="text-foreground text-[15px]">{value}</Tex>
        ) : (
          <span className="text-xs text-muted-foreground italic">live preview</span>
        )}
      </div>

      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        placeholder={placeholder}
        rows={2}
        className="w-full resize-none bg-transparent px-3 pb-2 pt-1 text-sm font-mono outline-none placeholder:text-muted-foreground/60 scroll-fancy"
      />

      {/* palette */}
      <div className="flex flex-wrap gap-1 border-t px-2 py-1.5 bg-muted/40 rounded-b-xl">
        {PALETTE.map((p) => (
          <button
            key={p.label}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              insert(p.insert, p.caret);
            }}
            className="rounded-md px-1.5 py-0.5 text-xs font-mono text-muted-foreground hover:bg-background hover:text-foreground transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
