import { stackServerApp } from "@/lib/utils/stack";
import { NextResponse } from "next/server";

/**
 * Forces a fresh sign-in by signing out any existing user and redirecting to sign-in.
 * Used by the desktop app to ensure users see the account picker.
 */
export async function GET(request: Request) {
  const user = await stackServerApp.getUser();

  if (user) {
    // Sign out without redirect - we'll handle the redirect ourselves
    await user.signOut();
  }

  // Redirect to sign-in page
  return NextResponse.redirect(new URL("/handler/sign-in", request.url));
}
