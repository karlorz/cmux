import { waitForConnectedSocket } from "@/contexts/socket/socket-boot";
import type {
  LocalPathSuggestion,
  LocalPathSuggestionsResponse,
  LocalRepoBranchesResponse,
  LocalRepoInspectResponse,
} from "@cmux/shared";

export async function fetchLocalPathSuggestions(
  query: string
): Promise<LocalPathSuggestion[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const socket = await waitForConnectedSocket();
  return await new Promise((resolve, reject) => {
    socket.emit(
      "local-path-suggestions",
      { query: trimmed },
      (response: LocalPathSuggestionsResponse) => {
        resolve(response.suggestions);
      }
    );
  });
}

export async function inspectLocalRepo(
  path: string
): Promise<LocalRepoInspectResponse> {
  const socket = await waitForConnectedSocket();
  return await new Promise((resolve, reject) => {
    socket.emit(
      "local-repo-inspect",
      { path },
      (response: LocalRepoInspectResponse) => {
        if (!response) {
          reject(new Error("Empty response from local-repo-inspect"));
          return;
        }
        resolve(response);
      }
    );
  });
}

export async function fetchLocalRepoBranches(
  path: string
): Promise<LocalRepoBranchesResponse> {
  const socket = await waitForConnectedSocket();
  return await new Promise((resolve, reject) => {
    socket.emit(
      "local-repo-branches",
      { path },
      (response: LocalRepoBranchesResponse) => {
        if (!response) {
          reject(new Error("Empty response from local-repo-branches"));
          return;
        }
        resolve(response);
      }
    );
  });
}
