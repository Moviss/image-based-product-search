import { connection } from "next/server";
import { getConfig } from "@/lib/config-store";
import { getTaxonomy } from "@/lib/taxonomy";
import { AdminPanel } from "@/components/admin-panel";
import type { TaxonomyCategory } from "@/lib/schemas";

export default async function AdminPage() {
  await connection();
  const config = getConfig();

  let taxonomy: TaxonomyCategory[] = [];
  try {
    taxonomy = await getTaxonomy();
  } catch {
    // MongoDB unavailable — render without taxonomy
  }

  return <AdminPanel initialConfig={config} taxonomy={taxonomy} />;
}
