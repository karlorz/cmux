import { CmuxIpcSocketClient } from "@/lib/cmux-ipc-socket-client";
import { type MainServerSocket } from "@cmux/shared/socket";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import React, { useEffect, useMemo } from "react";
import { cachedGetUser } from "../../lib/cachedGetUser";
import { stackClientApp } from "../../lib/stack";
import { authJsonQueryOptions } from "../convex/authJsonQueryOptions";
import { setGlobalSocket, socketBoot } from "./socket-boot";
import { ElectronSocketContext } from "./socket-context";
import type { SocketContextType } from "./types";
import { normalizeAuthJson } from "./normalizeAuthJson";

export const ElectronSocketProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const authJsonQuery = useQuery(authJsonQueryOptions());
  const normalizedAuth = useMemo(
    () => normalizeAuthJson(authJsonQuery.data),
    [authJsonQuery.data]
  );
  const authToken = normalizedAuth.authToken;
  const location = useLocation();
  const [socket, setSocket] = React.useState<
    SocketContextType["socket"] | null
  >(null);
  const [isConnected, setIsConnected] = React.useState(false);
  const [availableEditors, setAvailableEditors] =
    React.useState<SocketContextType["availableEditors"]>(null);
  const lastAuthSignatureRef = React.useRef<string | null>(null);
  const lastSocketRef = React.useRef<MainServerSocket | null>(null);
  const teamSlugOrId = React.useMemo(() => {
    const pathname = location.pathname || "";
    const seg = pathname.split("/").filter(Boolean)[0];
    if (!seg || seg === "team-picker") return undefined;
    return seg;
  }, [location.pathname]);

  useEffect(() => {
    if (!authToken) {
      console.warn("[ElectronSocket] No auth token yet; delaying connect");
      return;
    }

    let disposed = false;
    let createdSocket: CmuxIpcSocketClient | null = null;

    (async () => {
      const user = await cachedGetUser(stackClientApp);
      const authJson = user ? await user.getAuthJson() : undefined;

      const normalizedForConnect = normalizeAuthJson(authJson ?? null);
      const effectiveAuthToken =
        normalizedForConnect.authToken ?? authToken;
      if (!effectiveAuthToken) {
        console.warn(
          "[ElectronSocket] Unable to determine auth token for connect"
        );
        return;
      }

      const query: Record<string, string> = { auth: effectiveAuthToken };
      if (teamSlugOrId) {
        query.team = teamSlugOrId;
      }
      if (normalizedForConnect.serializedAuthJson) {
        query.auth_json = normalizedForConnect.serializedAuthJson;
      }

      if (disposed) return;

      console.log("[ElectronSocket] Connecting via IPC (cmux)...");
      createdSocket = new CmuxIpcSocketClient(query);

      createdSocket.on("connect", () => {
        if (disposed) return;
        setIsConnected(true);
      });

      createdSocket.on("disconnect", () => {
        if (disposed) return;
        console.log("[ElectronSocket] Disconnected from IPC");
        setIsConnected(false);
      });

      createdSocket.on("connect_error", (error: unknown) => {
        console.error("[ElectronSocket] Connection error:", error);
      });

      createdSocket.on("available-editors", (editors: unknown) => {
        if (disposed) return;
        setAvailableEditors(editors as SocketContextType["availableEditors"]);
      });

      // Connect the socket
      createdSocket.connect();

      if (!disposed) {
        // Cast to Socket type to satisfy type requirement
        setSocket(createdSocket as unknown as MainServerSocket);
        setGlobalSocket(createdSocket as unknown as MainServerSocket);
        // Signal that the provider has created the socket instance
        socketBoot.resolve();
      }
    })();

    return () => {
      disposed = true;
      if (createdSocket) {
        console.log("[ElectronSocket] Cleaning up IPC socket");
        createdSocket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      // Reset boot handle so future mounts can suspend appropriately
      setGlobalSocket(null);
      socketBoot.reset();
    };
  }, [authToken, teamSlugOrId]);

  useEffect(() => {
    if (lastSocketRef.current !== socket) {
      lastSocketRef.current = socket;
      lastAuthSignatureRef.current = null;
    }
  }, [socket]);

  useEffect(() => {
    if (
      !socket ||
      !normalizedAuth.authToken ||
      !normalizedAuth.serializedAuthJson
    ) {
      return;
    }

    const signature = `${normalizedAuth.authToken}:${normalizedAuth.serializedAuthJson}`;
    if (lastAuthSignatureRef.current === signature) {
      return;
    }

    lastAuthSignatureRef.current = signature;
    socket.emit("auth-update-token", {
      authToken: normalizedAuth.authToken,
      authJson: normalizedAuth.serializedAuthJson,
    });
  }, [
    socket,
    normalizedAuth.authToken,
    normalizedAuth.serializedAuthJson,
  ]);

  const contextValue = useMemo<SocketContextType>(
    () => ({
      socket,
      isConnected,
      availableEditors,
    }),
    [socket, isConnected, availableEditors]
  );

  return (
    <ElectronSocketContext.Provider value={contextValue}>
      {children}
    </ElectronSocketContext.Provider>
  );
};
