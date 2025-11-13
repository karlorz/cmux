import type {
  AvailableEditors,
  ClientToServerEventsWithAuth,
  ServerToClientEvents,
} from "@cmux/shared";
import type { Socket } from "socket.io-client";

export type CmuxSocket = Socket<
  ServerToClientEvents,
  ClientToServerEventsWithAuth
>;
export interface SocketContextType {
  socket: CmuxSocket | null;
  isConnected: boolean;
  availableEditors: AvailableEditors | null;
}
