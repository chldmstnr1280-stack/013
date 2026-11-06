"use client";
import { useState } from "react";

export function CountedTextarea({ name, defaultValue, max, rows = 8, disabled, id }: { name: string; defaultValue: string; max: number; rows?: number; disabled?: boolean; id: string }) {
  const [v, setV] = useState(defaultValue);
  const n = [...v].length;
  return (
    <div>
      <textarea id={id} name={name} rows={rows} value={v} onChange={(e) => setV(e.target.value)} disabled={disabled} className="input font-[inherit] leading-relaxed" />
      <div className={`mt-1 text-right text-xs ${n > max ? "font-semibold text-red-600" : "text-slate-400"}`} aria-live="polite">
        {n} / {max}자
      </div>
    </div>
  );
}
