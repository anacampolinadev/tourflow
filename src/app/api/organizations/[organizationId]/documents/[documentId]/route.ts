import type { NextRequest } from "next/server";
import { AccessDenied } from "@/modules/auth";
import { downloadDocument } from "@/modules/compliance";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, { params }: { params: Promise<{ organizationId: string; documentId: string }> }) {
  const { organizationId, documentId } = await params;
  const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'", "Referrer-Policy": "no-referrer" };
  try {
    const document = await downloadDocument(organizationId, documentId, request.nextUrl.searchParams.get("scope") === "admin" ? "admin" : "owner");
    if (!document) return new Response(null, { status: 404, headers });
    const extension = document.mimeType === "application/pdf" ? "pdf" : document.mimeType === "image/png" ? "png" : "jpg";
    return new Response(new Uint8Array(document.data), { headers: { ...headers, "Content-Type": document.mimeType, "Content-Disposition": `attachment; filename="documento.${extension}"` } });
  } catch (error) {
    if (error instanceof AccessDenied) return new Response(null, { status: 404, headers });
    throw error;
  }
}
