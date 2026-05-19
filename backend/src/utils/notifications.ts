import { Prisma, PrismaClient } from '@prisma/client';

// 同时支持 PrismaClient 与 $transaction 回调里的 tx 客户端，
// 让调用方可以把通知写入与主业务变更包进同一事务，保证原子性。
export type PrismaLike = PrismaClient | Prisma.TransactionClient;

export async function createInAppNotification(
  prisma: PrismaLike,
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
