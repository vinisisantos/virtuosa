export const CRM_NOTIFICATION_SNAPSHOT_EVENT = "virtuosa:crm-notification-snapshot";

export type CrmNotificationSnapshotItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  icon: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
};

export type CrmNotificationSnapshot = {
  notifications: CrmNotificationSnapshotItem[];
  unreadCount: number;
};
