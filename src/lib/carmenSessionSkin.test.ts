import { expect, test } from "vitest";
import {
  getSessionSkin,
  setSessionSkin,
  setWorkshopSkin,
} from "./carmenSessionSkin.ts";
import { applyWorkshopSkin, setWorkshopContext } from "./workshopBridge.ts";

const openWorkshop = () =>
  setWorkshopContext({
    projectId: "p-1",
    title: null,
    selectedArtifactId: null,
    selectedSceneId: null,
    selectedSceneNumber: null,
  });

test("a role the workshop switched Carmen to ends when the workshop closes", () => {
  setSessionSkin("t-1", "sales_coach");
  openWorkshop();
  setWorkshopSkin("t-1", "video_director");
  setWorkshopSkin("t-1", "video_editor");
  expect(getSessionSkin("t-1")).toBe("video_editor");

  setWorkshopContext(null);
  // The next request from /clients goes out with the skin the user had, not the editor's.
  expect(getSessionSkin("t-1")).toBe("sales_coach");
});

test("leaving the workshop goes back to the base skin when none was picked", () => {
  openWorkshop();
  setWorkshopSkin("t-2", "creative_direct");
  setWorkshopContext(null);
  expect(getSessionSkin("t-2")).toBe(null);
});

test("a role skin that streams in after the workshop closed does not switch Carmen", () => {
  setSessionSkin("t-4", "sales_coach");
  openWorkshop();
  applyWorkshopSkin("t-4", "video_director");
  setWorkshopContext(null);
  // The turn the user left keeps streaming; its next tool's skin event arrives on /clients.
  applyWorkshopSkin("t-4", "video_editor");
  expect(getSessionSkin("t-4")).toBe("sales_coach");
});

test("a skin the user picks in the workshop stays after it", () => {
  openWorkshop();
  setWorkshopSkin("t-3", "video_director");
  setSessionSkin("t-3", "creative_direct");
  setWorkshopContext(null);
  expect(getSessionSkin("t-3")).toBe("creative_direct");
});
