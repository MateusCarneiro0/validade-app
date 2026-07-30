import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { scheduleExpirationReminders, cancelProductNotifications } from '@/services/notifications';
import { createProduct } from '@/services/storage';
import type { Product } from '@/types/product';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock AsyncStorage used by storage service indirectly
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Mock expo-notifications completely to avoid native module resolution
let notifCounter = 0;
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockImplementation(async () => {
    notifCounter++;
    return `notif-id-${notifCounter}`;
  }),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  SchedulableTriggerInputTypes: {
    DATE: 'date',
  },
  AndroidImportance: {
    HIGH: 4,
  },
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
}));

// Reset mocks and storage before each test
beforeEach(async () => {
  jest.clearAllMocks();
  notifCounter = 0;
  await AsyncStorage.clear();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    barcode: '7891234567890',
    format: 'EAN-13',
    name: 'Leite Integral',
    expirationDate: '2026-09-30',
    createdAt: new Date('2026-07-30T10:00:00Z').toISOString(),
    notificationIds: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// scheduleExpirationReminders
// ---------------------------------------------------------------------------

describe('scheduleExpirationReminders', () => {
  it('schedules 30d, 15d, 7d, 3d, 1d and 0d notifications when there is enough time', async () => {
    // Expires in 31+ days → all 6 reminders should be scheduled
    const product = makeProduct({ expirationDate: '2026-09-30' });

    const ids = await scheduleExpirationReminders(product);

    expect(ids).toHaveLength(6);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(6);
  });

  it('schedules only applicable reminders (7d, 3d, 1d and 0d for product expiring in 10 days)', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-01T10:00:00Z'));

    const product = makeProduct({ expirationDate: '2026-08-08' }); // 7 days from now

    const ids = await scheduleExpirationReminders(product);

    // 30d: 7 < 30 → skip
    // 15d: 7 < 15 → skip
    // 7d: 7 >= 7 → schedule
    // 3d: 7 >= 3 → schedule
    // 1d: 7 >= 1 → schedule
    // 0d: 7 >= 0 → schedule
    expect(ids).toHaveLength(4);

    jest.useRealTimers();
  });

  it('schedules only 1d and 0d notification for product expiring tomorrow', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-01T06:00:00Z'));

    const product = makeProduct({ expirationDate: '2026-08-02' }); // tomorrow

    const ids = await scheduleExpirationReminders(product);

    // 30d: 1 < 30 → skip
    // 15d: 1 < 15 → skip
    // 7d: 1 < 7 → skip
    // 3d: 1 < 3 → skip
    // 1d: 1 >= 1 → schedule
    // 0d: 1 >= 0 → schedule
    expect(ids).toHaveLength(2);

    jest.useRealTimers();
  });

  it('schedules only 0d notification for product expiring today', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-01T06:00:00Z'));

    const product = makeProduct({ expirationDate: '2026-08-01' }); // today

    const ids = await scheduleExpirationReminders(product);

    // Only 0d since 0 >= 0
    expect(ids).toHaveLength(1);

    jest.useRealTimers();
  });

  it('does not schedule any notification for already expired products', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-10T10:00:00Z'));

    const product = makeProduct({ expirationDate: '2026-07-01' }); // expired

    const ids = await scheduleExpirationReminders(product);

    expect(ids).toHaveLength(0);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();

    jest.useRealTimers();
  });

  it('schedules notification for 0 days with "vence hoje" body', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-30T06:00:00Z'));

    const product = makeProduct({ expirationDate: '2026-09-30' });

    await scheduleExpirationReminders(product);

    // Check that the last call (0d) has the "vence hoje" body
    const calls = jest.mocked(Notifications.scheduleNotificationAsync).mock.calls;
    const lastCall = calls[calls.length - 1][0];
    expect(lastCall.content.title).toBe('📦 Produto vence hoje!');
    expect(lastCall.content.body).toContain('vence hoje');

    jest.useRealTimers();
  });

  it('schedules notifications at 9 AM', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-01T10:00:00Z'));

    const product = makeProduct({ expirationDate: '2026-09-30' });

    await scheduleExpirationReminders(product);

    const calls = jest.mocked(Notifications.scheduleNotificationAsync).mock.calls;
    for (const call of calls) {
      const trigger = call[0].trigger as { date: Date };
      expect(trigger.date.getHours()).toBe(9);
      expect(trigger.date.getMinutes()).toBe(0);
    }

    jest.useRealTimers();
  });

  it('persists notification IDs to AsyncStorage', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-01T10:00:00Z'));

    // First save the product to storage so updateProductNotificationIds works
    const savedProduct = await createProduct({
      barcode: '7891234567890',
      format: 'EAN-13',
      name: 'Leite Integral',
      expirationDate: '2026-09-30',
      notificationIds: [],
    });

    await scheduleExpirationReminders(savedProduct);

    // Verify notificationIds were saved
    const json = await AsyncStorage.getItem('@validade/products');
    const products = JSON.parse(json!);
    const updated = products[0];
    expect(updated.notificationIds.length).toBeGreaterThan(0);
    expect(updated.notificationIds[0]).toBe('notif-id-1');

    jest.useRealTimers();
  });

  it('continua agendando mesmo se uma notificação individual falhar', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-01T10:00:00Z'));

    // Make the 2nd notification call fail (15d - index 1)
    const scheduleMock = jest.mocked(Notifications.scheduleNotificationAsync);
    scheduleMock
      .mockResolvedValueOnce('notif-ok-1')  // 30d → ok
      .mockRejectedValueOnce(new Error('Falha ao agendar'))  // 15d → fail
      .mockResolvedValueOnce('notif-ok-2')  // 7d → ok
      .mockResolvedValueOnce('notif-ok-3')  // 3d → ok
      .mockResolvedValueOnce('notif-ok-4')  // 1d → ok
      .mockResolvedValueOnce('notif-ok-5'); // 0d → ok

    const product = makeProduct({ expirationDate: '2026-09-30' }); // 60+ days out
    const ids = await scheduleExpirationReminders(product);

    // Should have 5 IDs (30d, 7d, 3d, 1d, 0d) — 15d failed but was caught
    expect(ids).toHaveLength(5);
    expect(ids).toEqual(['notif-ok-1', 'notif-ok-2', 'notif-ok-3', 'notif-ok-4', 'notif-ok-5']);

    jest.useRealTimers();
  });

  it('retorna array vazio se todas as notificações falharem', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-01T10:00:00Z'));

    const scheduleMock = jest.mocked(Notifications.scheduleNotificationAsync);
    scheduleMock.mockRejectedValue(new Error('Sem permissão'));

    const product = makeProduct({ expirationDate: '2026-09-30' });
    const ids = await scheduleExpirationReminders(product);

    // Todas falharam, array vazio
    expect(ids).toHaveLength(0);
    // Não deve tentar persistir IDs vazios
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(6);

    jest.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// cancelProductNotifications
// ---------------------------------------------------------------------------

describe('cancelProductNotifications', () => {
  it('cancels all scheduled notifications for a product', async () => {
    const product = makeProduct({
      notificationIds: ['notif-a', 'notif-b', 'notif-c'],
    });

    await cancelProductNotifications(product);

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(3);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-a');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-b');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-c');
  });

  it('clears notification IDs from storage', async () => {
    // First save a product with notifications
    const product = makeProduct({ id: 'prod-clear' });
    await AsyncStorage.setItem('@validade/products', JSON.stringify([
      { ...product, notificationIds: ['notif-1', 'notif-2'] },
    ]));

    const productWithIds = makeProduct({
      id: 'prod-clear',
      notificationIds: ['notif-1', 'notif-2'],
    });

    await cancelProductNotifications(productWithIds);

    const json = await AsyncStorage.getItem('@validade/products');
    const products = JSON.parse(json!);
    expect(products[0].notificationIds).toEqual([]);
  });

  it('handles empty notification IDs gracefully', async () => {
    const product = makeProduct({ notificationIds: [] });
    await cancelProductNotifications(product);
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });
});
