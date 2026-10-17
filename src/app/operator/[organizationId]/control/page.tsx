import { ManagedOperations } from "@/components/managed-operations";
export const dynamic = "force-dynamic";
export default async function ControlPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ status?: string; page?: string }> }) {
  return <ManagedOperations organizationId={(await params).organizationId} scope="owner" search={await searchParams} />;
}
