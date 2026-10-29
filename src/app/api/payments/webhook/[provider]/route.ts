import { handleWebhook } from "@/modules/payments";

/** A gateway's delivery. The body is read raw: the signature covers its exact bytes, so it is parsed only after it is verified. */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { status, result } = await handleWebhook((await params).provider, await req.text(), req.headers);
  return Response.json({ result }, { status });
}
