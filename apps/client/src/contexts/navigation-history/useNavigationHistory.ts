import { useContext } from "react";
import { NavigationHistoryContext } from "./context";

export function useNavigationHistory() {
  const ctx = useContext(NavigationHistoryContext);
  if (!ctx) {
    throw new Error(
      "useNavigationHistory must be used within NavigationHistoryProvider"
    );
  }
  return ctx;
}
