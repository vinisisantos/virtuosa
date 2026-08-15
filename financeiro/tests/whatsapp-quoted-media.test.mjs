import assert from "node:assert/strict";
import test from "node:test";

import { findQuotedImagePreviewTarget } from "../src/lib/whatsapp/quoted-media.ts";

test("abre exatamente a imagem citada dentro de um álbum", () => {
  const target = findQuotedImagePreviewTarget([
    {
      kind: "album",
      id: "album:1",
      message: { messageId: "image-3", type: "image", mediaUrl: "image-3.jpg" },
      images: [
        { messageId: "image-1", type: "image", mediaUrl: "image-1.jpg" },
        { messageId: "image-2", type: "image", mediaUrl: "image-2.jpg" },
        { messageId: "image-3", type: "image", mediaUrl: "image-3.jpg" },
      ],
    },
  ], "image-2");

  assert.deepEqual(target, {
    itemId: "album:1",
    sources: ["image-1.jpg", "image-2.jpg", "image-3.jpg"],
    index: 1,
  });
});

test("abre uma imagem individual citada", () => {
  const target = findQuotedImagePreviewTarget([
    {
      kind: "message",
      id: "message-db-1",
      message: { messageId: "provider-1", type: "image", mediaUrl: "single.jpg" },
    },
  ], "provider-1");

  assert.deepEqual(target, {
    itemId: "message-db-1",
    sources: ["single.jpg"],
    index: 0,
  });
});

test("não abre mídia diferente da imagem citada", () => {
  const target = findQuotedImagePreviewTarget([
    {
      kind: "message",
      id: "message-db-1",
      message: { messageId: "provider-1", type: "video", mediaUrl: "video.mp4" },
    },
  ], "provider-1");

  assert.equal(target, null);
});
