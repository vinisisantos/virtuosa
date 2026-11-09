export const ALICE_ATTENDANT_NAME = "Alice";

type ConversationAttendance = {
  aiMode?: string;
  aliceAttending?: boolean;
  assignedToName?: string | null;
};

export function aliceIsAttending(conversation: ConversationAttendance) {
  return conversation.aiMode === "agent" && conversation.aliceAttending === true;
}

export function inboxAttendantName(conversation: ConversationAttendance) {
  return aliceIsAttending(conversation) ? ALICE_ATTENDANT_NAME : conversation.assignedToName;
}

type MessageAuthor = { respondedBy?: string | null; respondedByName?: string | null };

export function inboxMessageAuthorName(message: MessageAuthor) {
  return message.respondedByName === "Alice (automação)" ? ALICE_ATTENDANT_NAME : message.respondedByName;
}

export function inboxMessageAuthorKey(message: MessageAuthor) {
  return message.respondedBy ? `user:${message.respondedBy}` : `name:${inboxMessageAuthorName(message) || ""}`;
}
