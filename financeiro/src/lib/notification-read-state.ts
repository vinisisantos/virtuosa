export function notificationWithViewerReadState<
  T extends { userId: string | null; isRead: boolean },
>(notification: T): T {
  if (notification.userId !== null || notification.isRead) return notification;

  // Avisos globais têm um único registro compartilhado. Eles são informativos
  // para todos, mas não podem compor a fila individual de não lidas.
  return { ...notification, isRead: true };
}
