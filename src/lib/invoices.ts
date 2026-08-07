import type { Contract, Invoice } from "@/lib/types";

/** Local calendar date as YYYY-MM-DD. */
export function todayIsoDate(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Add days to a YYYY-MM-DD date string (or today if empty). */
export function addDaysIsoDate(isoDate: string, days: number): string {
  const base = isoDate || todayIsoDate();
  const [y, m, d] = base.split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  date.setDate(date.getDate() + days);
  return todayIsoDate(date);
}

function shortContractCode(contractName: string): string {
  const letters = contractName
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase())
    .join("")
    .slice(0, 4);
  return letters || "INV";
}

/**
 * Suggest the next invoice number for a contract from prior invoice numbers.
 * Prefers PREFIX-NNN style increments; falls back to {code}-001 / count+1.
 */
export function suggestNextInvoiceNumber(
  contract: Pick<Contract, "id" | "contract_name">,
  invoices: Pick<Invoice, "contract_id" | "invoice_number">[]
): string {
  const related = invoices.filter(
    (inv) => inv.contract_id === contract.id && inv.invoice_number?.trim()
  );
  let bestPrefix: string | null = null;
  let bestNum = 0;
  let bestWidth = 3;

  for (const inv of related) {
    const raw = inv.invoice_number!.trim();
    const match = raw.match(/^(.*?)(\d+)$/);
    if (!match) continue;
    const prefix = match[1] ?? "";
    const digits = match[2] ?? "";
    const num = Number(digits);
    if (!Number.isFinite(num)) continue;
    if (num > bestNum || (num === bestNum && digits.length > bestWidth)) {
      bestNum = num;
      bestPrefix = prefix;
      bestWidth = digits.length;
    }
  }

  if (bestPrefix != null) {
    const next = bestNum + 1;
    return `${bestPrefix}${String(next).padStart(bestWidth, "0")}`;
  }

  const code = shortContractCode(contract.contract_name);
  const n = related.length + 1;
  return `${code}-${String(n).padStart(3, "0")}`;
}

export type InvoiceContractDefaults = {
  retainage_percent: string;
  invoice_date?: string;
  due_date?: string;
  description?: string;
  invoice_number?: string;
};

/**
 * Defaults when a contract is selected. Only fills empty text/date fields;
 * retainage always follows the contract.
 */
export function contractInvoiceDefaults(
  contract: Pick<Contract, "id" | "contract_name" | "retainage_percent">,
  invoices: Pick<Invoice, "contract_id" | "invoice_number">[],
  current: {
    invoice_date: string;
    due_date: string;
    description: string;
    invoice_number: string;
  }
): InvoiceContractDefaults {
  const invoiceDate = current.invoice_date || todayIsoDate();
  const dueDate = current.due_date || addDaysIsoDate(invoiceDate, 30);
  const description =
    current.description.trim() ||
    `Progress billing — ${contract.contract_name}`;
  const invoiceNumber =
    current.invoice_number.trim() || suggestNextInvoiceNumber(contract, invoices);

  return {
    retainage_percent:
      contract.retainage_percent != null ? String(contract.retainage_percent) : "10",
    invoice_date: invoiceDate,
    due_date: dueDate,
    description,
    invoice_number: invoiceNumber,
  };
}
