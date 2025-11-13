import { ElectronWebContentsPage } from "@/components/ElectronWebContentsPage";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/debug-webcontents")({
  component: DebugWebContentsRoute,
  staticData: {
    title: "Debug WebContents",
  },
});

function DebugWebContentsRoute() {
  return <ElectronWebContentsPage forceWebContentsView />;
}
