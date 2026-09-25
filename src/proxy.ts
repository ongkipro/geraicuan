import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import { resolveHostRouting } from "@/lib/auth-config";
import { routeByHost } from "@/lib/host-routing";

// Resolved once per server instance; `src/instrumentation.ts` has already
// refused to start a production server whose origins are missing or malformed.
const routing = resolveHostRouting(process.env);
const production = process.env.NODE_ENV === "production";

export function proxy(request: NextRequest) {
  const decision = routeByHost({
    // Cookie presence only picks where `/` lands; the page layouts still
    // validate the session and the principal's scope.
    hasSessionCookie: Boolean(getSessionCookie(request)),
    host: request.headers.get("host"),
    pathname: request.nextUrl.pathname,
    production,
    routing,
    search: request.nextUrl.search,
  });

  switch (decision.kind) {
    case "next":
      return NextResponse.next();
    case "rewrite": {
      const url = request.nextUrl.clone();
      url.pathname = decision.pathname;
      return NextResponse.rewrite(url);
    }
    case "redirect":
      return NextResponse.redirect(decision.location, decision.status);
    case "not-found":
      return new NextResponse("Not Found", {
        headers: { "content-type": "text/plain; charset=utf-8" },
        status: 404,
      });
  }
}

export const config = {
  // Static build output and Next.js development internals are served on both
  // hosts; everything else, Server Function POSTs included, is routed by host.
  matcher: ["/((?!_next/static|_next/image|__nextjs).*)"],
};
