import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Product } from '@/types/product';

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

const PRODUCTS_KEY = '@validade/products';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a short unique ID.
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get all stored products, ordered by expiration date (soonest first).
 */
export async function getProducts(): Promise<Product[]> {
  try {
    const json = await AsyncStorage.getItem(PRODUCTS_KEY);
    if (!json) return [];
    const products: Product[] = JSON.parse(json);
    return products.sort(
      (a, b) => new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime(),
    );
  } catch {
    return [];
  }
}

/**
 * Get a single product by ID.
 */
export async function getProductById(id: string): Promise<Product | null> {
  const products = await getProducts();
  return products.find((p) => p.id === id) ?? null;
}

/**
 * Save a new product. Returns the created product with generated ID.
 */
export async function createProduct(data: {
  barcode: string;
  format: string;
  name: string;
  expirationDate: string;
  notificationIds: string[];
}): Promise<Product> {
  const product: Product = {
    id: generateId(),
    barcode: data.barcode,
    format: data.format,
    name: data.name,
    expirationDate: data.expirationDate,
    createdAt: new Date().toISOString(),
    notificationIds: data.notificationIds,
  };

  const products = await getProducts();
  products.push(product);
  await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));

  return product;
}

/**
 * Delete a product by ID.
 */
export async function deleteProduct(id: string): Promise<void> {
  const products = await getProducts();
  const filtered = products.filter((p) => p.id !== id);
  await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(filtered));
}

/**
 * Update notification IDs for a product.
 */
export async function updateProductNotificationIds(
  id: string,
  notificationIds: string[],
): Promise<void> {
  const products = await getProducts();
  const index = products.findIndex((p) => p.id === id);
  if (index === -1) return;
  products[index].notificationIds = notificationIds;
  await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
}
