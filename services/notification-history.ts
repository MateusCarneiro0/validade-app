import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NotificationEvent {
  /** Unique identifier */
  id: string;
  /** Notification title */
  title: string;
  /** Notification body text */
  body: string;
  /** Product ID associated with the notification (if any) */
  productId?: string;
  /** Days before expiration (0 = expires today, 7, 15, 30) */
  daysBefore?: number;
  /** When the notification was received (ISO string) */
  receivedAt: string;
  /** Whether the user has tapped/read the notification */
  read: boolean;
}

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

const HISTORY_KEY = '@validade/notification-history';
const MAX_HISTORY = 100;
const DEDUP_MS = 2000; // Avoid duplicate entries within 2 seconds

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get all notification history entries, sorted by most recent first.
 */
export async function getNotificationHistory(): Promise<NotificationEvent[]> {
  try {
    const json = await AsyncStorage.getItem(HISTORY_KEY);
    if (!json) return [];
    const history: NotificationEvent[] = JSON.parse(json);
    return history.sort(
      (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
    );
  } catch {
    return [];
  }
}

/**
 * Get count of unread notifications.
 */
export async function getUnreadCount(): Promise<number> {
  const history = await getNotificationHistory();
  return history.filter((e) => !e.read).length;
}

/**
 * Log a notification event to the history.
 */
export async function logNotificationEvent(event: {
  title: string;
  body: string;
  productId?: string;
  daysBefore?: number;
}): Promise<void> {
  try {
    const history = await getNotificationHistory();

    // Dedup: skip if an identical entry was added within the last DEDUP_MS
    const now = Date.now();
    const recentDuplicate = history.some(
      (e) =>
        e.productId === event.productId &&
        e.daysBefore === event.daysBefore &&
        now - new Date(e.receivedAt).getTime() < DEDUP_MS,
    );
    if (recentDuplicate) return;

    const newEvent: NotificationEvent = {
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      title: event.title,
      body: event.body,
      productId: event.productId,
      daysBefore: event.daysBefore,
      receivedAt: new Date().toISOString(),
      read: false,
    };

    history.unshift(newEvent);

    // Keep only the most recent entries
    if (history.length > MAX_HISTORY) {
      history.length = MAX_HISTORY;
    }

    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Silently ignore storage errors to avoid breaking notification handling
  }
}

/**
 * Mark a notification as read.
 */
export async function markAsRead(id: string): Promise<void> {
  try {
    const history = await getNotificationHistory();
    const index = history.findIndex((e) => e.id === id);
    if (index === -1) return;
    history[index].read = true;
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Silently ignore
  }
}

/**
 * Mark all notifications as read.
 */
export async function markAllAsRead(): Promise<void> {
  try {
    const history = await getNotificationHistory();
    for (const entry of history) {
      entry.read = true;
    }
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Silently ignore
  }
}

/**
 * Clear all notification history.
 */
export async function clearHistory(): Promise<void> {
  try {
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify([]));
  } catch {
    // Silently ignore
  }
}

// ---------------------------------------------------------------------------
// Notification listeners (setup)
// ---------------------------------------------------------------------------

let listenersRegistered = false;

/**
 * Register expo-notification listeners to automatically log events.
 * Call once at app startup.
 */
export function registerNotificationListeners(): () => void {
  if (listenersRegistered) {
    return () => {};
  }
  listenersRegistered = true;

  // When notification is received while app is in foreground
  const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
    const { title, body, data } = notification.request.content;
    logNotificationEvent({
      title: title || 'Notificação',
      body: (body as string) || '',
      productId: data?.productId as string | undefined,
      daysBefore: data?.daysBefore as number | undefined,
    });
  });

  // When user taps or responds to a notification
  // Log only if it's NOT a duplicate of a recently received event (dedup logic inside logNotificationEvent)
  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const { title, body, data } = response.notification.request.content;
    logNotificationEvent({
      title: title || 'Notificação',
      body: (body as string) || '',
      productId: data?.productId as string | undefined,
      daysBefore: data?.daysBefore as number | undefined,
    });
  });

  // Return cleanup function
  return () => {
    listenersRegistered = false;
    receivedSubscription.remove();
    responseSubscription.remove();
  };
}
