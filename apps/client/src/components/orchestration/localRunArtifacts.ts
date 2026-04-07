import type { LocalRunArtifactDisplay } from "@cmux/shared";
import {
  buildLocalRunArtifactDisplay as buildSharedLocalRunArtifactDisplay,
} from "@cmux/shared";
import type { LocalRunDetail } from "@cmux/www-openapi-client";

export function buildLocalArtifactDisplay(
  detail: LocalRunDetail,
): LocalRunArtifactDisplay {
  return detail.artifactDisplay ?? buildSharedLocalRunArtifactDisplay(detail);
}
