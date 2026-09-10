import { redirect } from "next/navigation";

export default async function LegacyCodexPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const values = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : value == null ? [] : [value]) query.append(key, item);
  }
  redirect(`/task-chat${query.size ? `?${query.toString()}` : ""}`);
}
