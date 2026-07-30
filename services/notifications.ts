import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Product } from '@/types/product';
import { daysUntilExpiration } from '@/types/product';
import { updateProductNotificationIds, getProductById } from '@/services/storage';

// ---------------------------------------------------------------------------
// Notification handler setup
// ---------------------------------------------------------------------------

/**
 * Must be called once at app startup (e.g. in app/_layout.tsx).
 * Configures how notifications are shown while the app is in the foreground.
 */
export function setupNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

// ---------------------------------------------------------------------------
// Permission
// ---------------------------------------------------------------------------

/**
 * Request notification permissions from the user.
 * Returns true if granted.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;

  if (!granted) {
    const result = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    granted = result.granted;
  }

  if (!granted) {
    return false;
  }

  // Android: set notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('product-expiry', {
      name: 'Vencimento de Produtos',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0a7ea4',
    });
  }

  return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a YYYY-MM-DD string into a local-timezone Date at midnight.
 * Avoids the UTC interpretation of `new Date('YYYY-MM-DD')` which can
 * shift the date by the UTC offset (e.g. -1 day in Brazil UTC-3).
 */
function parseLocalDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-');
  return new Date(Number(y), Number(m) - 1, Number(d));
}

/**
 * Build a contextual notification title and body for the given milestone.
 */
function buildNotificationContent(
  product: Product,
  daysBefore: number,
): { title: string; body: string } {
  switch (daysBefore) {
    case 30:
      return {
        title: '📦 Vence em 30 dias',
        body: `O produto "${product.name}" vence em 30 dias. Fique atento à data de validade.`,
      };
    case 15:
      return {
        title: '📦 Vence em 15 dias',
        body: `O produto "${product.name}" vence em 15 dias. Programe-se para consumi-lo.`,
      };
    case 7:
      return {
        title: '📦 Vence em 7 dias',
        body: `O produto "${product.name}" vence em 7 dias. Não se esqueça de utilizá-lo!`,
      };
    case 3:
      return {
        title: '📦 Vence em 3 dias',
        body: `O produto "${product.name}" vence em apenas 3 dias! É hora de usar ou doar.`,
      };
    case 1:
      return {
        title: '📦 Vence amanhã!',
        body: `O produto "${product.name}" vence amanhã! Não deixe passar!`,
      };
    case 0:
      return {
        title: '📦 Produto vence hoje!',
        body: `O produto "${product.name}" vence hoje! Consuma ou descarte agora.`,
      };
    default:
      return {
        title: '📦 Produto próximo do vencimento!',
        body: `O produto "${product.name}" vence em ${daysBefore} dias.`,
      };
  }
}

// ---------------------------------------------------------------------------
// Schedule notifications for a product
// ---------------------------------------------------------------------------

/**
 * The milestones at which we want to send reminders (in days before expiration).
 * 0 = the day of expiration itself.
 */
const REMINDER_DAYS = [30, 15, 7, 3, 1, 0] as const;

/**
 * Schedule all applicable reminders for a product.
 * Returns an array of scheduled notification identifiers.
 */
export async function scheduleExpirationReminders(product: Product): Promise<string[]> {
  const notificationIds: string[] = [];
  const daysUntilExp = daysUntilExpiration(product.expirationDate);

  for (const daysBefore of REMINDER_DAYS) {
    // Only schedule if the product still has at least this many days until expiration
    if (daysUntilExp >= daysBefore) {
      // Use local-timezone date to avoid UTC offset shift (bug #1 fix)
      const triggerDate = parseLocalDate(product.expirationDate);
      triggerDate.setDate(triggerDate.getDate() - daysBefore);
      triggerDate.setHours(9, 0, 0, 0); // Notify at 9:00 AM local time

      try {
        const { title, body } = buildNotificationContent(product, daysBefore);

        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title,
            body,
            data: {
              productId: product.id,
              daysBefore,
            },
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: triggerDate,
          },
        });

        notificationIds.push(notificationId);
      } catch {
        // Falha ao agendar notificação individual não deve impedir
        // as demais notificações ou o salvamento do produto.
      }
    }
  }

  // Persist notification IDs — always re-fetch from storage to avoid accumulating
  // stale IDs that were already cancelled (e.g. after reschedule).
  if (notificationIds.length > 0) {
    const fresh = await getProductById(product.id);
    const existingIds = fresh?.notificationIds ?? product.notificationIds ?? [];
    await updateProductNotificationIds(product.id, [
      ...existingIds,
      ...notificationIds,
    ]);
  }

  return notificationIds;
}

// ---------------------------------------------------------------------------
// Cancel notifications for a product
// ---------------------------------------------------------------------------

/**
 * Cancel all scheduled notifications associated with a product.
 */
export async function cancelProductNotifications(product: Product): Promise<void> {
  const ids = product.notificationIds || [];
  for (const id of ids) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      // Notification might not exist, ignore
    }
  }
  await updateProductNotificationIds(product.id, []);
}

// ---------------------------------------------------------------------------
// Reschedule all notifications (e.g. if dates changed)
// ---------------------------------------------------------------------------

/**
 * Cancel old notifications and reschedule new ones.
 * Re-fetches the product from storage after cancelling so the cleared
 * notificationIds are used, avoiding accumulation of stale cancelled IDs.
 */
export async function rescheduleExpirationReminders(product: Product): Promise<string[]> {
  await cancelProductNotifications(product);

  // Re-fetch from storage so scheduleExpirationReminders sees notificationIds = []
  const fresh = await getProductById(product.id);

  return await scheduleExpirationReminders(fresh ?? product);
}
