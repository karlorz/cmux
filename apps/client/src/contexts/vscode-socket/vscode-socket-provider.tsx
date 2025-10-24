import { io, type Socket } from "socket.io-client";
import React, { useEffect, useState } from "react";
import type { VSCodeClientToServerEvents, VSCodeServerToClientEvents } from "@cmux/shared";
import { VSCodeSocketContext, type VSCodeSocketContextType } from "./vscode-socket-context";

interface VSCodeSocketProviderProps {
  children: React.ReactNode;
}

export const VSCodeSocketProvider: React.FC<VSCodeSocketProviderProps> = ({
  children,
}) => {
  const [vscodeSocket, setVSCodeSocket] = useState<VSCodeSocketContextType["vscodeSocket"]>(null);
  const [isVSCodeConnected, setIsVSCodeConnected] = useState(false);

  const connectToVSCode = (url: string) => {
    if (vscodeSocket && vscodeSocket.connected) {
      console.log("[VSCode Socket] Already connected");
      return;
    }

    console.log("[VSCode Socket] Connecting to:", url);
    
    // Clean up existing socket if any
    if (vscodeSocket) {
      vscodeSocket.removeAllListeners();
      vscodeSocket.disconnect();
    }

    const newSocket = io(url, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    }) as Socket<VSCodeServerToClientEvents, VSCodeClientToServerEvents>;

    newSocket.on("connect", () => {
      console.log("[VSCode Socket] Connected to VS Code extension");
      setIsVSCodeConnected(true);
    });

    newSocket.on("disconnect", () => {
      console.log("[VSCode Socket] Disconnected from VS Code extension");
      setIsVSCodeConnected(false);
    });

    newSocket.on("connect_error", (error) => {
      console.error("[VSCode Socket] Connection error:", error);
      setIsVSCodeConnected(false);
    });

    setVSCodeSocket(newSocket);
  };

  const disconnectFromVSCode = () => {
    if (vscodeSocket) {
      vscodeSocket.removeAllListeners();
      vscodeSocket.disconnect();
      setVSCodeSocket(null);
      setIsVSCodeConnected(false);
    }
  };

  useEffect(() => {
    return () => {
      if (vscodeSocket) {
        vscodeSocket.removeAllListeners();
        vscodeSocket.disconnect();
      }
    };
  }, [vscodeSocket]);

  const contextValue: VSCodeSocketContextType = {
    vscodeSocket,
    isVSCodeConnected,
    connectToVSCode,
    disconnectFromVSCode,
  };

  return (
    <VSCodeSocketContext.Provider value={contextValue}>
      {children}
    </VSCodeSocketContext.Provider>
  );
};