import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { freshZoomRecordingUrls } from "./zoom-recordings-list.ts";

const listData = {
  meetings: [
    { id: 1, recording_files: [] },
    {
      id: 42,
      uuid: "u-42",
      recording_files: [
        { recording_type: "shared_screen", download_url: "https://z/v" },
        {
          recording_type: "audio_only",
          download_url: "https://z/a",
          play_url: "https://z/p",
        },
      ],
    },
  ],
};

Deno.test(
  "freshZoomRecordingUrls puts the wanted recording type first, without duplicates",
  () => {
    assertEquals(freshZoomRecordingUrls(listData, "42", "AUDIO_ONLY"), [
      "https://z/a",
      "https://z/p",
      "https://z/v",
    ]);
    assertStrictEquals(
      freshZoomRecordingUrls(listData, "u-42", "")?.[0],
      "https://z/v",
    );
  },
);

Deno.test(
  "freshZoomRecordingUrls returns null when the meeting is missing",
  () => {
    assertStrictEquals(
      freshZoomRecordingUrls(listData, "7", "audio_only"),
      null,
    );
    assertStrictEquals(freshZoomRecordingUrls({}, "42", "audio_only"), null);
    assertEquals(freshZoomRecordingUrls(listData, "1", "x"), []);
  },
);
