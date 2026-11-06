"use client";
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

/** 제출 중 중복 클릭 방지 버튼 */
export function Submit({
  children,
  className = "btn-primary",
  pending = "처리 중…",
  confirm,
  name,
  value,
}: {
  children: ReactNode;
  className?: string;
  pending?: string;
  confirm?: string;
  name?: string;
  value?: string;
}) {
  const { pending: busy } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={className}
      disabled={busy}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {busy ? pending : children}
    </button>
  );
}
