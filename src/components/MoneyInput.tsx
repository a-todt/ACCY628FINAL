"use client";

import type { ChangeEvent, InputHTMLAttributes } from "react";
import { sanitizeMoneyInput } from "@/lib/moneyInput";

type MoneyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "inputMode" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
};

/**
 * Money amount field: allows decimals, strips $, commas, and spaces on type/paste.
 */
export function MoneyInput({
  value,
  onValueChange,
  className = "input input-bordered w-full",
  ...rest
}: MoneyInputProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onValueChange(sanitizeMoneyInput(e.target.value));
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={className}
      value={value}
      onChange={handleChange}
    />
  );
}
