import { stackClientApp } from "@/lib/stack";
import { StackHandler } from "@stackframe/react";
import { createFileRoute, useLocation } from "@tanstack/react-router";

export const Route = createFileRoute("/handler/$")({
  component: HandlerComponent,
});

function HandlerComponent() {
  const location = useLocation();
  // Hash history: OAuth query lands on location.search (or sometimes in the
  // hash fragment). Stack needs path + query to exchange the code.
  const handlerLocation = `${location.pathname}${location.search}`;

  return (
    <StackHandler app={stackClientApp} location={handlerLocation} fullPage />
  );
}
