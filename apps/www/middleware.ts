import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { stackServerApp } from "@/lib/utils/stack";

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Skip middleware for static files, API routes, and handler routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/handler") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  try {
    // Check if user is authenticated
    const user = await stackServerApp.getUser({ or: "return-null" });

    // If not authenticated and trying to access a protected route
    if (!user && isProtectedRoute(pathname)) {
      // Construct the full path including query params
      const returnTo = pathname + search;

      // Redirect to sign-in with return_to parameter
      // Note: We don't include is_electron here because web users
      // accessing from browsers should stay in the browser
      const signInUrl = new URL("/handler/sign-in", request.url);
      signInUrl.searchParams.set("return_to", returnTo);

      return NextResponse.redirect(signInUrl);
    }

    return NextResponse.next();
  } catch (error) {
    console.error("[middleware] Error checking auth:", error);
    return NextResponse.next();
  }
}

/**
 * Determine if a route requires authentication
 */
function isProtectedRoute(pathname: string): boolean {
  // PR review pages require auth
  if (pathname.match(/^\/[^/]+\/[^/]+\/pull\/\d+/)) {
    return true;
  }

  // Compare pages require auth
  if (pathname.match(/^\/[^/]+\/[^/]+\/compare\//)) {
    return true;
  }

  // Team-specific pages require auth (format: /{teamSlugOrId}/...)
  // But exclude some public pages
  const publicPaths = ["/tutorial", "/", "/handler"];
  if (publicPaths.some((path) => pathname === path || pathname.startsWith(path + "/"))) {
    return false;
  }

  // If it starts with /{something}/... it's likely a team route
  if (pathname.match(/^\/[^/]+\/.+/)) {
    return true;
  }

  return false;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*|api).*)",
  ],
};
