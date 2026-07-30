// ---------------------------------------------------------------------------
// Product type
// ---------------------------------------------------------------------------

export interface Product {
  /** Unique identifier */
  id: string;
  /** Raw barcode data */
  barcode: string;
  /** Human-readable format label (e.g. "EAN-13", "QR Code") */
  format: string;
  /** User-defined product name */
  name: string;
  /** Batch/lot number */
  lote?: string;
  /** Quantity */
  quantidade?: number;
  /** Product image URL or local URI */
  imagem?: string;
  /** Expiration date in ISO string (YYYY-MM-DD) */
  expirationDate: string;
  /** When the product was registered (ISO string) */
  createdAt: string;
  /** Identifiers of scheduled notifications for cancellation */
  notificationIds: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calculate how many days remain until the given expiration date.
 * Returns a negative number if already expired.
 */
export function daysUntilExpiration(expirationDate: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(expirationDate + 'T00:00:00');
  const diffMs = exp.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Returns the status label for a product based on days until expiration.
 */
export function getExpirationStatus(days: number): {
  label: string;
  color: string;
  bgColor: string;
} {
  if (days < 0) {
    return { label: 'Vencido', color: '#fff', bgColor: '#e74c3c' };
  }
  if (days === 0) {
    return { label: 'Vence hoje', color: '#fff', bgColor: '#e67e22' };
  }
  if (days <= 7) {
    return { label: `${days}d`, color: '#fff', bgColor: '#e67e22' };
  }
  if (days <= 15) {
    return { label: `${days}d`, color: '#fff', bgColor: '#f39c12' };
  }
  if (days <= 30) {
    return { label: `${days}d`, color: '#fff', bgColor: '#27ae60' };
  }
  return { label: `${days}d`, color: '#fff', bgColor: '#2980b9' };
}
