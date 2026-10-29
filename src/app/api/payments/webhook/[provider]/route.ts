import { handleWebhook } from "@/modules/payments";

// shortcut: one flat cap for every provider; raise it or make it per provider if a real gateway sends bigger events.
const MAX_BODY_BYTES = 64 * 1024;

/** A gateway's delivery. The body is read raw: the signature covers its exact bytes, so it is parsed only after it is verified. */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  if (Number(req.headers.get("content-length")) > MAX_BODY_BYTES) return Response.json({}, { status: 413 });
  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) return Response.json({}, { status: 413 });
  const { status, result } = await handleWebhook((await params).provider, rawBody, req.headers);
  return Response.json({ result }, { status });
}
