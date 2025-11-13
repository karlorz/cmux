import type {
  ClientToServerEventsWithAuth,
  SocketAuthHeaders,
} from "@cmux/shared";
import type { MainServerSocket } from "@cmux/shared/socket";
import { cachedGetUser } from "../cachedGetUser";
import { stackClientApp } from "../stack";

let inflightHeaders: Promise<SocketAuthHeaders> | null = null;

type EventArgsWithoutAuth<E extends keyof ClientToServerEventsWithAuth> =
  Parameters<ClientToServerEventsWithAuth[E]> extends [
    SocketAuthHeaders,
    ...infer P,
  ]
    ? P
    : never;

async function fetchSocketAuthHeaders(): Promise<SocketAuthHeaders> {
  if (!inflightHeaders) {
    inflightHeaders = (async () => {
      const user = await cachedGetUser(stackClientApp);
      if (!user) {
        throw new Error("Unable to resolve authenticated user for socket emit");
      }
      const rawHeaders = await user.getAuthHeaders();
      if (rawHeaders instanceof Headers) {
        const headers: SocketAuthHeaders = {};
        rawHeaders.forEach((value, key) => {
          headers[key] = value;
        });
        return headers;
      }

      const headers: SocketAuthHeaders = {};
      for (const [key, value] of Object.entries(rawHeaders ?? {})) {
        if (typeof value === "string") {
          headers[key] = value;
        }
      }
      return headers;
    })()
      .catch((error) => {
        throw error;
      })
      .finally(() => {
        inflightHeaders = null;
      });
  }

  return inflightHeaders;
}

export async function emitWithAuth<E extends keyof ClientToServerEventsWithAuth>(
  socket: MainServerSocket | null | undefined,
  event: E,
  ...args: EventArgsWithoutAuth<E>
): Promise<boolean> {
  if (!socket) {
    console.warn(`[Socket] Attempted to emit '${String(event)}' without socket`);
    return false;
  }

  try {
    const headers = await fetchSocketAuthHeaders();
    const payload = [headers, ...args] as unknown as Parameters<
      ClientToServerEventsWithAuth[E]
    >;
    socket.emit(event, ...payload);
    return true;
  } catch (error) {
    console.error(`[Socket] Failed to emit '${String(event)}'`, error);
    return false;
  }
}
