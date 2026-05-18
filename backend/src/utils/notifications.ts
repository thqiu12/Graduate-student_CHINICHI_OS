import { PrismaClient } from '@prisma/client';

export async function createInAppNotification(
  prisma: PrismaClient,
  data: {
    userId: string;
    type: string;
    title: string;
    content?: string | null;
    relatedId?: string | null;
  },
): Promise<{ id: string }> {
  const notification = await prisma.notification.create({
    data: {
      userId: data.userId,
      type: data.type,
      title: data.title,
      content: data.content ?? null,
      relatedId: data.relatedId ?? null,
    },
  });

  await prisma.notificationDelivery.create({
    data: {
      notificationId: notification.id,
      channel: 'in_app',
      status: 'sent',
      sentAt: new Date(),
    },
  });

  return { id: notification.id };
}
