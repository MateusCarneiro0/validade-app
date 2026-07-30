import { daysUntilExpiration, getExpirationStatus } from '@/types/product';

// ---------------------------------------------------------------------------
// daysUntilExpiration
// ---------------------------------------------------------------------------

describe('daysUntilExpiration', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-30T10:00:00Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('returns 0 when expiration is today', () => {
    expect(daysUntilExpiration('2026-07-30')).toBe(0);
  });

  it('returns 7 when expiration is 7 days from now', () => {
    expect(daysUntilExpiration('2026-08-06')).toBe(7);
  });

  it('returns 30 when expiration is 30 days from now', () => {
    expect(daysUntilExpiration('2026-08-29')).toBe(30);
  });

  it('returns 15 when expiration is 15 days from now', () => {
    expect(daysUntilExpiration('2026-08-14')).toBe(15);
  });

  it('returns 1 when expiration is tomorrow', () => {
    expect(daysUntilExpiration('2026-07-31')).toBe(1);
  });

  it('returns a negative number when already expired', () => {
    const result = daysUntilExpiration('2026-07-28');
    expect(result).toBeLessThan(0);
  });

  it('returns -1 when expired yesterday', () => {
    expect(daysUntilExpiration('2026-07-29')).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// getExpirationStatus
// ---------------------------------------------------------------------------

describe('getExpirationStatus', () => {
  it('returns "Vencido" for negative days', () => {
    const status = getExpirationStatus(-1);
    expect(status.label).toBe('Vencido');
    expect(status.bgColor).toBe('#e74c3c');
  });

  it('returns "Vence hoje" for 0 days', () => {
    const status = getExpirationStatus(0);
    expect(status.label).toBe('Vence hoje');
    expect(status.bgColor).toBe('#e67e22');
  });

  it('returns days count for 1-7 days', () => {
    const status = getExpirationStatus(5);
    expect(status.label).toBe('5d');
    expect(status.bgColor).toBe('#e67e22');
  });

  it('returns days count for 8-15 days', () => {
    const status = getExpirationStatus(12);
    expect(status.label).toBe('12d');
    expect(status.bgColor).toBe('#f39c12');
  });

  it('returns days count for 16-30 days', () => {
    const status = getExpirationStatus(25);
    expect(status.label).toBe('25d');
    expect(status.bgColor).toBe('#27ae60');
  });

  it('returns days count for 30+ days', () => {
    const status = getExpirationStatus(45);
    expect(status.label).toBe('45d');
    expect(status.bgColor).toBe('#2980b9');
  });

  it('returns "Vencido" with red color for deeply expired', () => {
    const status = getExpirationStatus(-100);
    expect(status.label).toBe('Vencido');
    expect(status.color).toBe('#fff');
    expect(status.bgColor).toBe('#e74c3c');
  });

  it('returns correct color hex format for all statuses', () => {
    const statuses = [-5, 0, 3, 10, 20, 60];
    statuses.forEach((days) => {
      const status = getExpirationStatus(days);
      expect(status.color).toMatch(/^#[0-9a-fA-F]{3,6}$/);
      expect(status.bgColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });
});
