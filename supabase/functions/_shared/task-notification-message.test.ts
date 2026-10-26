import {
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  buildTaskAppLink,
  formatTaskNotificationMessage,
  resolveTaskNotificationLinkTenantId,
  resolveTaskNotificationSenderTenantIds,
} from "./task-notification-message.ts";

const task = {
  id: "task-123",
  title: "להכין דוח",
  notes: null,
  priority: 5,
  due_date: null,
  due_time: null,
};

Deno.test(
  "task links use the recipient campaigner tenant, not the task owner",
  () => {
    assertStrictEquals(
      buildTaskAppLink("task-123", "marketingcaptain"),
      "https://aios.co.il/t/marketingcaptain/tasks?task=task-123",
    );
    assertStrictEquals(
      buildTaskAppLink("task-123", "dmm"),
      "https://aios.co.il/t/dmm/tasks?task=task-123",
    );
  },
);

Deno.test(
  "link tenant prefers the assignee campaigner home tenant over DMM/client",
  () => {
    const linkTenantId = resolveTaskNotificationLinkTenantId({
      notifyCreator: false,
      campaignerTenantId: "marketing-captain-tenant",
      fallbackTenantId: "dmm-tenant",
    });
    assertStrictEquals(linkTenantId, "marketing-captain-tenant");
  },
);

Deno.test(
  "creator notifications use the creator home tenant, not the assignee tenant",
  () => {
    const linkTenantId = resolveTaskNotificationLinkTenantId({
      notifyCreator: true,
      creatorHomeTenantId: "dmm-tenant",
      campaignerTenantId: "marketing-captain-tenant",
      fallbackTenantId: "dmm-tenant",
    });
    assertStrictEquals(linkTenantId, "dmm-tenant");
  },
);

Deno.test(
  "sender tenant prefers the assignee home tenant before the client tenant",
  () => {
    const senderTenantIds = resolveTaskNotificationSenderTenantIds({
      notifyCreator: false,
      campaignerTenantId: "marketing-captain-tenant",
      fallbackTenantId: "dmm-tenant",
    });
    assertEquals(senderTenantIds, ["marketing-captain-tenant", "dmm-tenant"]);
  },
);

Deno.test(
  "creator sender tenant prefers the creator home tenant before the client tenant",
  () => {
    const senderTenantIds = resolveTaskNotificationSenderTenantIds({
      notifyCreator: true,
      creatorHomeTenantId: "dmm-tenant",
      campaignerTenantId: "marketing-captain-tenant",
      fallbackTenantId: "marketing-captain-tenant",
    });
    assertEquals(senderTenantIds, ["dmm-tenant", "marketing-captain-tenant"]);
  },
);

Deno.test("new assignment identifies the person who gave the task", () => {
  const message = formatTaskNotificationMessage(
    "task_assigned",
    task,
    "לקוח בדיקה",
    "דוד",
    "דוד",
    "אנה",
    "marketingcaptain",
  );

  assertMatch(message, /משימה חדשה ניתנה לך על ידי אנה/);
  assertMatch(message, /להכין דוח/);
  assertMatch(message, /\/t\/marketingcaptain\/tasks\?task=task-123/);
  assertNotMatch(message, /https:\/\/aios\.co\.il\/tasks\?task=/);
});

Deno.test(
  "adding a collaborator tells them they were added, with a tenant link",
  () => {
    const message = formatTaskNotificationMessage(
      "task_collaborator_added",
      task,
      "אביאלי",
      "אנה",
      "אנה",
      "דוד",
      "marketingcaptain",
    );
    assertMatch(message, /נוספת למשימה על ידי דוד/);
    assertMatch(message, /אביאלי/);
    assertMatch(message, /\/t\/marketingcaptain\/tasks\?task=task-123/);
  },
);

Deno.test("a task update names the author, the task, and the link", () => {
  const message = formatTaskNotificationMessage(
    "task_update_added",
    { ...task, notes: "הערות פנימיות שלא אמורות להישלח" },
    "אביאלי",
    "אנה",
    "אנה",
    "דוד",
    "marketingcaptain",
    { updaterName: "דוד", updateContent: "יש עדכון לגבי נטישת העגלה" },
  );
  assertMatch(message, /יש עדכון חדש במשימה מאת דוד/);
  assertMatch(message, /להכין דוח/);
  assertMatch(message, /יש עדכון לגבי נטישת העגלה/);
  assertMatch(message, /\/t\/marketingcaptain\/tasks\?task=task-123/);
  assertNotMatch(message, /הערות פנימיות/);
});

Deno.test(
  "legacy unattributed assignment still has a useful fallback message",
  () => {
    const message = formatTaskNotificationMessage(
      "task_assigned",
      task,
      "משימה כללית",
      "דוד",
      "דוד",
      "",
    );

    assertMatch(message, /משימה חדשה שויכה אליך/);
    assertNotMatch(message, /על ידי/);
  },
);
