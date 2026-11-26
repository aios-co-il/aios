/** The first bytes of each file type the picture tests use, with a few bytes of body. */
export const PICTURE_BYTES = {
  jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]),
  png: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]),
  webp: new Uint8Array([...ascii("RIFF"), 0x24, 0, 0, 0, ...ascii("WEBPVP8 ")]),
  gif: new Uint8Array([...ascii("GIF89a"), 1, 0, 1, 0]),
  pdf: new Uint8Array(ascii("%PDF-1.7\n")),
};

/** The text's bytes. */
function ascii(value: string): Array<number> {
  return Array.from(new TextEncoder().encode(value));
}
