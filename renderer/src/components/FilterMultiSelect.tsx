import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Check, X } from "lucide-react";

type Option = { value: string; label: string };

type FilterMultiSelectProps = {
  values: string[];
  onChange: (values: string[]) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
};

export function FilterMultiSelect({
  values,
  onChange,
  options,
  placeholder = "Все",
  className = "",
  "data-testid": testId,
}: FilterMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const toggle = (val: string) => {
    onChange(values.includes(val) ? values.filter(v => v !== val) : [...values, val]);
  };

  const labelFor = (val: string) => options.find(o => o.value === val)?.label ?? val;

  return (
    <div ref={ref} className={cn("relative min-w-[9rem]", className)}>
      <button
        type="button"
        data-testid={testId}
        onClick={() => setOpen(prev => !prev)}
        className={`w-full bg-input border rounded-md px-2 py-1.5 text-xs text-left flex items-center gap-1.5 focus:outline-none focus:ring-1 focus:ring-ring transition-colors ${
          values.length > 0 ? "border-primary/50 text-foreground" : "border-border text-muted-foreground"
        }`}
      >
        <div className="flex flex-wrap gap-1 flex-1 min-w-0">
          {values.length === 0 ? (
            <span className="truncate">{placeholder}</span>
          ) : values.length <= 2 ? (
            values.map(v => (
              <span
                key={v}
                className="inline-flex max-w-full items-center gap-0.5 truncate rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground"
              >
                <span className="truncate">{labelFor(v)}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={e => { e.stopPropagation(); toggle(v); }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-2.5 h-2.5" />
                </span>
              </span>
            ))
          ) : (
            <span className="text-foreground font-medium">{values.length} выбрано</span>
          )}
        </div>
        <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[10rem] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md">
          <div className="scrollbar-thin max-h-48 overflow-y-auto p-1">
            {options.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">Нет вариантов</div>
            ) : (
              options.map(o => {
                const selected = values.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggle(o.value)}
                    className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors hover:bg-secondary ${
                      selected ? "bg-primary/10 text-foreground" : "text-foreground"
                    }`}
                  >
                    <div
                      className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border ${
                        selected ? "border-primary bg-primary" : "border-border bg-background"
                      }`}
                    >
                      {selected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                    </div>
                    <span className="truncate">{o.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
