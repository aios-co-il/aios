/**
 * Peer task notifications come straight from the app, so over Shabbat
 * trigger-automation stores them in task_notification_holds and
 * task-notification-worker replays each one once (AIO-226).
 */
export const PEER_TASK_NOTIFICATION_TYPES = new Set([
  "task_collaborator_added",
  "task_update_added",
]);

/** A task_notification_holds row: the trigger-automation request to replay. */
export type HeldPeerNotification = {
  task_id: string;
  notification_type: string;
  hold_key: string;
  request_body: {
    trigger_type: string;
    tenant_id: string | null;
    data: Record<string, string>;
  };
};
