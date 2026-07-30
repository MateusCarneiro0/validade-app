import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getNotificationHistory,
  getUnreadCount,
  logNotificationEvent,
  markAsRead,
  markAllAsRead,
  clearHistory,
} from '@/services/notification-history';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Mock expo-notifications to avoid native module resolution in Jest
jest.mock('expo-notifications', () => ({
  addNotificationReceivedListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  addNotificationResponseReceivedListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { HIGH: 4 },
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
}));

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    title: '📦 Produto próximo do vencimento!',
    body: 'O produto "Leite" está 7 dias de vencer.',
    productId: 'prod-123',
    daysBefore: 7,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getNotificationHistory
// ---------------------------------------------------------------------------

describe('getNotificationHistory', () => {
  it('returns empty array when no history stored', async () => {
    const history = await getNotificationHistory();
    expect(history).toEqual([]);
  });

  it('returns entries sorted by most recent first', async () => {
    await logNotificationEvent(makeEvent({ title: 'Evento 1', daysBefore: 30 }));
    await logNotificationEvent(makeEvent({ title: 'Evento 2', daysBefore: 7 }));

    const history = await getNotificationHistory();
    expect(history).toHaveLength(2);
    expect(history[0].title).toBe('Evento 2');
    expect(history[1].title).toBe('Evento 1');
  });
});

// ---------------------------------------------------------------------------
// getUnreadCount
// ---------------------------------------------------------------------------

describe('getUnreadCount', () => {
  it('returns 0 when history is empty', async () => {
    const count = await getUnreadCount();
    expect(count).toBe(0);
  });

  it('returns correct count of unread events', async () => {
    await logNotificationEvent(makeEvent({ title: 'Event 1', productId: 'prod-a' }));
    await logNotificationEvent(makeEvent({ title: 'Event 2', productId: 'prod-b' }));

    const all = await getNotificationHistory();
    await markAsRead(all[1].id); // mark older one as read

    const unread = await getUnreadCount();
    expect(unread).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// logNotificationEvent
// ---------------------------------------------------------------------------

describe('logNotificationEvent', () => {
  it('persists a notification event', async () => {
    await logNotificationEvent(makeEvent());

    const history = await getNotificationHistory();
    expect(history).toHaveLength(1);
    expect(history[0].title).toBe('📦 Produto próximo do vencimento!');
    expect(history[0].body).toContain('Leite');
    expect(history[0].productId).toBe('prod-123');
    expect(history[0].daysBefore).toBe(7);
    expect(history[0].read).toBe(false);
    expect(history[0].id).toBeDefined();
    expect(history[0].receivedAt).toBeDefined();
  });

  it('does not create duplicate entries within 2 seconds', async () => {
    await logNotificationEvent(makeEvent());
    await logNotificationEvent(makeEvent()); // Same content within 2s

    const history = await getNotificationHistory();
    expect(history).toHaveLength(1);
  });

  it('creates separate entries for different products', async () => {
    await logNotificationEvent(makeEvent({ productId: 'prod-1' }));
    await logNotificationEvent(makeEvent({ productId: 'prod-2' }));

    const history = await getNotificationHistory();
    expect(history).toHaveLength(2);
  });

  it('handles events without productId gracefully', async () => {
    await logNotificationEvent({
      title: 'Notificação genérica',
      body: 'Mensagem sem produto',
    });

    const history = await getNotificationHistory();
    expect(history).toHaveLength(1);
    expect(history[0].productId).toBeUndefined();
  });

  it('does not crash when AsyncStorage fails', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('Storage error'));

    await expect(logNotificationEvent(makeEvent())).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// markAsRead
// ---------------------------------------------------------------------------

describe('markAsRead', () => {
  it('marks a single notification as read', async () => {
    await logNotificationEvent(makeEvent());
    const all = await getNotificationHistory();
    const id = all[0].id;

    await markAsRead(id);

    const updated = await getNotificationHistory();
    expect(updated[0].read).toBe(true);
  });

  it('does nothing for non-existent id', async () => {
    await markAsRead('non-existent-id');
    // Should not throw
  });
});

// ---------------------------------------------------------------------------
// markAllAsRead
// ---------------------------------------------------------------------------

describe('markAllAsRead', () => {
  it('marks all notifications as read', async () => {
    await logNotificationEvent(makeEvent({ title: 'A' }));
    await logNotificationEvent(makeEvent({ title: 'B' }));

    await markAllAsRead();

    const history = await getNotificationHistory();
    expect(history.every((e) => e.read)).toBe(true);
  });

  it('does nothing when history is empty', async () => {
    await markAllAsRead();
    // Should not throw
  });
});

// ---------------------------------------------------------------------------
// clearHistory
// ---------------------------------------------------------------------------

describe('clearHistory', () => {
  it('clears all notification history', async () => {
    await logNotificationEvent(makeEvent());
    await logNotificationEvent(makeEvent({ title: 'B' }));

    await clearHistory();

    const history = await getNotificationHistory();
    expect(history).toEqual([]);
  });
});
