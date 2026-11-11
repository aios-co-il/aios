import {
  ClientMoodPicker,
  ClientStatusPicker,
} from "@/components/clients/ClientStatusOptions";
import {
  isClientMood,
  isClientStatus,
} from "@/components/clients/clientStatusMeta";
import { cn } from "@/lib/utils";
import type { ClientRow } from "./clientRow";
import type { ClientRowMutations } from "./useClientRowMutations";

interface RowSelectProps {
  client: ClientRow;
  mutations: ClientRowMutations;
  className?: string;
}

/** The row's status as a chip-styled picker that saves on change. */
export function ClientStatusSelect({
  client,
  mutations,
  className,
}: RowSelectProps) {
  return (
    <ClientStatusPicker
      value={client.status}
      className={cn("h-9 w-full", className)}
      onChange={(value) => {
        if (isClientStatus(value)) {
          mutations.updateStatus.mutate({ clientId: client.id, status: value });
        }
      }}
    />
  );
}

/** The row's mood as a tinted picker that saves on change. */
export function ClientMoodSelect({
  client,
  mutations,
  className,
}: RowSelectProps) {
  return (
    <ClientMoodPicker
      value={client.mood_status}
      className={cn("h-9 w-full", className)}
      onChange={(value) => {
        if (isClientMood(value)) {
          mutations.updateMood.mutate({
            clientId: client.id,
            moodStatus: value,
          });
        }
      }}
    />
  );
}
