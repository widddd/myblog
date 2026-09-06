import { NextResponse } from "next/server";

import { resolveLegacyPostHref } from "@/lib/posts/query";

type LegacyPostContext = {
  params: Promise<{ publicId: string }>;
};

export async function GET(request: Request, context: LegacyPostContext) {
  const { publicId } = await context.params;
  const dest = await resolveLegacyPostHref(publicId);
  if (!dest) {
    return new NextResponse("Not Found", { status: 404 });
  }
  return NextResponse.redirect(new URL(dest, request.url), 301);
}

export const HEAD = GET;
