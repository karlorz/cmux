import { getPveLxcClient } from "@/lib/utils/pve-lxc-client";
import {
  type SandboxInstance,
  wrapMorphInstance,
  wrapPveLxcInstance,
} from "@/lib/utils/sandbox-instance";
import type { MorphCloudClient } from "morphcloud";

export function isPveLxcInstanceId(instanceId: string): boolean {
  return instanceId.startsWith("pvelxc-") || instanceId.startsWith("cmux-");
}

export async function getInstanceById(
  instanceId: string,
  getMorphClient: () => MorphCloudClient
): Promise<SandboxInstance> {
  if (isPveLxcInstanceId(instanceId)) {
    const pveClient = getPveLxcClient();
    const pveInstance = await pveClient.instances.get({ instanceId });
    return wrapPveLxcInstance(pveInstance);
  }

  const morphClient = getMorphClient();
  const morphInstance = await morphClient.instances.get({ instanceId });
  return wrapMorphInstance(morphInstance);
}
