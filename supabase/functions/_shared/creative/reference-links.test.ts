import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { readableReferenceUrls } from "./reference-links.ts";

const BASE = "https://example.supabase.co/storage/v1/object";
const TENANT = "bbbbbbbb-0000-0000-0000-000000000001";
const OTHER = "cccccccc-0000-0000-0000-000000000002";

/** A storage stand-in that signs every path, or fails when `fails` is set; it records what it signed. */
function storage(fails = false) {
  const signed: string[] = [];
  const supabase = {
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: (path: string, seconds: number) => {
          signed.push(`${bucket}/${path}`);
          return Promise.resolve(
            fails
              ? { data: null, error: { message: "denied" } }
              : {
                  data: {
                    signedUrl: `${BASE}/sign/${bucket}/${path}?t=${seconds}`,
                  },
                  error: null,
                },
          );
        },
      }),
    },
  };
  return { supabase, signed };
}

describe("readableReferenceUrls", () => {
  it("signs the tenant's own upload in the private bucket", async () => {
    const { supabase, signed } = storage();
    const upload = `${BASE}/public/entity-attachments/${TENANT}/workshop/item-1/poster.png`;
    const urls = await readableReferenceUrls(supabase, TENANT, [upload]);
    assertEquals(signed, [
      `entity-attachments/${TENANT}/workshop/item-1/poster.png`,
    ]);
    assertEquals(urls, [
      `${BASE}/sign/entity-attachments/${TENANT}/workshop/item-1/poster.png?t=600`,
    ]);
  });

  it("keeps a public link as it is", async () => {
    const { supabase, signed } = storage();
    const link = "https://cdn.example.com/look.jpg";
    assertEquals(await readableReferenceUrls(supabase, TENANT, [link]), [link]);
    assertEquals(signed, []);
  });

  it("never signs another tenant's file", async () => {
    const { supabase, signed } = storage();
    const foreign = `${BASE}/public/entity-attachments/${OTHER}/workshop/x/secret.png`;
    assertEquals(await readableReferenceUrls(supabase, TENANT, [foreign]), []);
    assertEquals(signed, []);
  });

  it("leaves out an upload that cannot be signed", async () => {
    const { supabase } = storage(true);
    const upload = `${BASE}/public/entity-attachments/${TENANT}/workshop/item-1/poster.png`;
    assertEquals(await readableReferenceUrls(supabase, TENANT, [upload]), []);
  });
});
