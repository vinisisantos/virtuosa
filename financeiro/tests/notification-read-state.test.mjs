import assert from "node:assert/strict";
import test from "node:test";

import { notificationWithViewerReadState } from "../src/lib/notification-read-state.ts";

test("mantém o estado individual de leitura", () => {
  const notification = { id: "personal", userId: "user-1", isRead: false };
  assert.equal(notificationWithViewerReadState(notification), notification);
});

test("apresenta aviso global como informativo sem alterar o registro", () => {
  const notification = { id: "global", userId: null, isRead: false };
  assert.deepEqual(notificationWithViewerReadState(notification), {
    id: "global",
    userId: null,
    isRead: true,
  });
  assert.equal(notification.isRead, false);
});
