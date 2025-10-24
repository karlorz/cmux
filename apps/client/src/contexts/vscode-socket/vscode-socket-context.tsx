import { createContext } from "react";
import type { Socket } from "socket.io-client";
import type { VSCodeClientToServerEvents, VSCodeServerToClientEvents } from "@cmux/shared";

export type VSCodeSocket = Socket<VSCodeServerToClientEvents, VSCodeClientToServerEvents>;

export interface VSCodeSocketContextType {
  vscodeSocket: VSCodeSocket | null;
  isVSCodeConnected: boolean;
  connectToVSCode: (url: string) => void;
  disconnectFromVSCode: () => void;
}

export const VSCodeSocketContext = createContext<VSCodeSocketContextType | null>(null);