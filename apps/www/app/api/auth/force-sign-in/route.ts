import { stackServerApp } from "@/lib/utils/stack";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Forces a fresh sign-in by signing out any existing user and redirecting to sign-in.
 * Used by the desktop app to ensure users see the account picker.
 */
export async function GET() {
  const user = await stackServerApp.getUser();

  if (user) {
    // Sign out without redirect - we'll handle the redirect ourselves
    await user.signOut();
  }

  // Get the host from headers to build the correct redirect URL
  const headersList = await headers();
  const host = headersList.get("host") || "localhost:9779";
  const protocol = headersList.get("x-forwarded-proto") || "https";
  const baseUrl = `${protocol}://${host}`;

  // Redirect to sign-in page
  return NextResponse.redirect(new URL("/handler/sign-in", baseUrl));
}
