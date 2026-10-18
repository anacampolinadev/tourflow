import { RetellConnection } from "@/components/retell-connection";
export const dynamic = "force-dynamic";
export default async function IntegrationsPage({ params }: { params: Promise<{ organizationId: string }> }) { return <RetellConnection organizationId={(await params).organizationId} admin={false} />; }
