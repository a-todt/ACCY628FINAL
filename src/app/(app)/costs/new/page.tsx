import { redirect } from "next/navigation";

/** Dashboard quick-add: open the cost tracker with the create form (`?new=1`). */
export default function NewCostPage() {
  redirect("/costs?new=1");
}
