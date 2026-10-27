/**
 * A task_notification_holds row (AIO-226): the request trigger-automation
 * stored over Shabbat and task-notification-worker replays once.
 */
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
