import { redirect } from "next/navigation";

/** Dashboard quick-add: open the invoices list with the create form (`?new=1`). */
export default function NewInvoicePage() {
  redirect("/invoices?new=1");
}
