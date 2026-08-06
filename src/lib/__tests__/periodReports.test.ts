import { describe, expect, it } from "vitest";
import type { ChangeOrder, Contract, CostEntry, Invoice, Payment } from "@/lib/types";
import {
  buildPeriodRows,
  costToCostEarned,
  cumulativeEarned,
  matchWipProject,
  resolveWipProject,
  monthKey,
  revisedContractValue,
} from "@/lib/periodReports";

const contract: Contract = {
  id: "c1",
  user_id: "u1",
  contract_name: "Alpha Job",
  client_name: "Client",
  client_email: null,
  client_phone: null,
  project_address: null,
  city: null,
  state: null,
  contract_type: "fixed_price",
  original_value: 1_000_000,
  retainage_percent: 10,
  start_date: null,
  end_date: null,
  status: "active",
  scope_description: null,
  special_terms: null,
  client_user_id: null,
  created_at: "2026-01-01",
};

function cost(partial: Partial<CostEntry> & Pick<CostEntry, "amount" | "date_incurred">): CostEntry {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    contract_id: "c1",
    user_id: "u1",
    category: "labor",
    description: null,
    notes: null,
    created_at: "2026-01-01",
    ...partial,
  };
}

function invoice(
  partial: Partial<Invoice> & Pick<Invoice, "invoice_amount" | "invoice_date">
): Invoice {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    contract_id: "c1",
    invoice_number: "INV",
    due_date: null,
    description: null,
    retainage_percent: null,
    retainage_amount: 0,
    net_amount_due: null,
    amount_paid: 0,
    status: "unpaid",
    notes: null,
    created_at: "2026-01-01",
    ...partial,
  };
}

describe("periodReports helpers", () => {
  it("builds month keys", () => {
    expect(monthKey("2026-03-15")).toBe("2026-03");
    expect(monthKey(null)).toBeNull();
  });

  it("matches WIP projects by name case-insensitively", () => {
    const match = matchWipProject(contract, [
      { id: "p1", project_name: "alpha job", estimated_total_cost: 800_000, revised_contract_value: 1_000_000 },
    ]);
    expect(match?.id).toBe("p1");
  });

  it("resolves WIP by contract_id before name", () => {
    const match = resolveWipProject(contract, [
      {
        id: "wrong-name",
        project_name: "Other Job",
        contract_id: "c1",
        estimated_total_cost: 700_000,
        revised_contract_value: 1_000_000,
      },
      {
        id: "name-match",
        project_name: "Alpha Job",
        contract_id: null,
        estimated_total_cost: 800_000,
        revised_contract_value: 1_000_000,
      },
    ]);
    expect(match?.id).toBe("wrong-name");
  });

  it("falls back to name match when contract_id is unset", () => {
    const match = resolveWipProject(contract, [
      {
        id: "p1",
        project_name: "Alpha Job",
        contract_id: null,
        estimated_total_cost: 800_000,
        revised_contract_value: 1_000_000,
      },
    ]);
    expect(match?.id).toBe("p1");
  });

  it("computes cost-to-cost earned at 25%", () => {
    expect(costToCostEarned(800_000, 1_000_000, 200_000)).toBe(250_000);
  });

  it("computes period earned as cumulative delta", () => {
    const costs = [
      cost({ amount: 200_000, date_incurred: "2026-01-15" }),
      cost({ amount: 200_000, date_incurred: "2026-02-10" }),
    ];
    const jan = cumulativeEarned({
      costs,
      revisedValue: 1_000_000,
      wipProject: {
        id: "p1",
        project_name: "Alpha Job",
        estimated_total_cost: 800_000,
        revised_contract_value: 1_000_000,
      },
      throughDate: "2026-01-31",
    });
    const feb = cumulativeEarned({
      costs,
      revisedValue: 1_000_000,
      wipProject: {
        id: "p1",
        project_name: "Alpha Job",
        estimated_total_cost: 800_000,
        revised_contract_value: 1_000_000,
      },
      throughDate: "2026-02-28",
    });
    expect(jan).toBe(250_000);
    expect(feb).toBe(500_000);
    expect(feb - jan).toBe(250_000);
  });
});

describe("buildPeriodRows", () => {
  it("aggregates monthly expenses, billed, earned and totals", () => {
    const changeOrders: ChangeOrder[] = [];
    const costs = [
      cost({ amount: 200_000, date_incurred: "2026-01-15" }),
      cost({ amount: 100_000, date_incurred: "2026-03-01" }),
    ];
    const invoices: Invoice[] = [
      invoice({ id: "i1", invoice_amount: 150_000, invoice_date: "2026-01-20" }),
      invoice({ id: "i2", invoice_amount: 80_000, invoice_date: "2026-03-05" }),
    ];
    const payments: Payment[] = [
      {
        id: "pay1",
        invoice_id: "i1",
        payment_amount: 50_000,
        payment_date: "2026-01-25",
        payment_method: null,
        reference_number: null,
        notes: null,
        created_at: "2026-01-25",
      },
    ];

    const result = buildPeriodRows({
      contracts: [contract],
      costEntries: costs,
      invoices,
      payments,
      changeOrders,
      projects: [
        {
          id: "p1",
          project_name: "Alpha Job",
          estimated_total_cost: 800_000,
          revised_contract_value: 1_000_000,
        },
      ],
      projectCosts: [{ project_id: "p1", amount: 10_000, cost_date: "2026-01-12" }],
      billings: [{ project_id: "p1", amount_billed: 20_000, billing_date: "2026-01-18" }],
      mode: "month",
      year: 2026,
      contractId: "c1",
    });

    expect(result.rows).toHaveLength(12);
    const jan = result.rows.find((r) => r.periodKey === "2026-01");
    expect(jan?.expenses).toBe(200_000);
    expect(jan?.billed).toBe(150_000);
    expect(jan?.collected).toBe(50_000);
    expect(jan?.earnedPeriod).toBe(250_000);
    expect(jan?.wipExpenses).toBe(10_000);
    expect(jan?.wipBilled).toBe(20_000);
    expect(jan?.hasWipMatch).toBe(true);

    expect(result.totals.expenses).toBe(300_000);
    expect(result.totals.billed).toBe(230_000);
    expect(result.totals.collected).toBe(50_000);
    expect(revisedContractValue(contract, changeOrders)).toBe(1_000_000);
  });

  it("yearly mode returns one row with period earned delta", () => {
    const costs = [cost({ amount: 200_000, date_incurred: "2026-06-01" })];
    const result = buildPeriodRows({
      contracts: [contract],
      costEntries: costs,
      invoices: [invoice({ invoice_amount: 100_000, invoice_date: "2026-07-01" })],
      payments: [],
      changeOrders: [],
      projects: [],
      projectCosts: [],
      billings: [],
      mode: "year",
      year: 2026,
      contractId: "c1",
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].expenses).toBe(200_000);
    expect(result.rows[0].billed).toBe(100_000);
    expect(result.rows[0].hasWipMatch).toBe(false);
    expect(result.rows[0].wipExpenses).toBeNull();
    // estimate = max(200k, 1M*0.85) = 850k; earned = 200/850 * 1M
    expect(result.rows[0].earnedPeriod).toBeCloseTo((200_000 / 850_000) * 1_000_000, 5);
  });
});
