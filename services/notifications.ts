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
// Schedule notifications for a product
// ---------------------------------------------------------------------------

/**
 * The milestones at which we want to send reminders (in days before expiration).
 * 0 = the day of expiration itself.
 */
const REMINDER_DAYS = [30, 15, 7, 0] as const;

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
      const triggerDate = new Date(product.expirationDate + 'T00:00:00');
      triggerDate.setDate(triggerDate.getDate() - daysBefore);
      triggerDate.setHours(9, 0, 0, 0); // Notify at 9:00 AM

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: daysBefore === 0
            ? '📦 Produto vence hoje!'
            : '📦 Produto próximo do vencimento!',
          body: daysBefore === 0
            ? `O produto "${product.name}" vence hoje! Não se esqueça!`
            : `O produto "${product.name}" está ${daysBefore} dias de vencer.`,
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
