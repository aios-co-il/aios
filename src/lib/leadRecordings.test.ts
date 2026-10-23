import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLeadRecordingItems,
  groupLeadRecordings,
} from "./leadRecordings.ts";

test("lists automatic, linked, and manual recordings together", () => {
  const items = buildLeadRecordingItems(
    [
      { id: "c1", lead_id: "lead", recording_url: "https://calls/1" },
      { id: "c2", lead_id: "lead", recording_url: null },
    ],
    [
      {
        id: "z1",
        lead_id: "lead",
        source: "zoom",
        meeting_topic: "פגישת היכרות",
        recording_url: "https://zoom/1",
        file_path: null,
      },
      {
        id: "m1",
        lead_id: "lead",
        source: "manual",
        meeting_topic: "שיחה",
        recording_url: null,
        file_path: "tenant/lead/1.mp3",
      },
      {
        id: "m2",
        lead_id: "lead",
        source: "manual",
        meeting_topic: "עוד",
        recording_url: null,
        file_path: "tenant/lead/2.mp3",
      },
      {
        id: "empty",
        lead_id: "lead",
        source: "manual",
        meeting_topic: null,
        recording_url: null,
        file_path: null,
      },
    ],
  );

  assert.deepEqual(
    items.map((item) => item.label),
    ["הקלטה אוטומטית", "פגישת היכרות", "הקלטה ידנית 1", "הקלטה ידנית 2"],
  );
  assert.equal(items[2].filePath, "tenant/lead/1.mp3");
});

test("groups recordings by lead", () => {
  const grouped = groupLeadRecordings(
    [{ id: "c1", lead_id: "a", recording_url: "https://calls/1" }],
    [
      {
        id: "m1",
        lead_id: "b",
        source: "manual",
        meeting_topic: null,
        recording_url: null,
        file_path: "b.mp3",
      },
    ],
  );
  assert.deepEqual(Object.keys(grouped).sort(), ["a", "b"]);
  assert.equal(grouped.a[0].label, "הקלטה אוטומטית");
  assert.equal(grouped.b[0].label, "הקלטה ידנית");
});

test("plays PBX uploads from the private call-recordings bucket", () => {
  const [item] = buildLeadRecordingItems(
    [
      {
        id: "c1",
        lead_id: "lead",
        recording_url: null,
        recording_path: "tenant/pbx/1.mp3",
      },
    ],
    [],
  );
  assert.equal(item.filePath, "tenant/pbx/1.mp3");
  assert.equal(item.bucket, "call-recordings");
});
