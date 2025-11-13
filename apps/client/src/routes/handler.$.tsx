import { stackClientApp } from "@/lib/stack";
import { StackHandler } from "@stackframe/react";
import { createFileRoute, useLocation } from "@tanstack/react-router";

export const Route = createFileRoute("/handler/$")({
  component: HandlerComponent,
  staticData: {
    title: "Handler",
  },
});

function HandlerComponent() {
  const location = useLocation();

  return (
    <StackHandler app={stackClientApp} location={location.pathname} fullPage />
  );
}
