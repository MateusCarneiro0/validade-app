import AsyncStorage from '@react-native-async-storage/async-storage';
import { getProducts, createProduct, deleteProduct, getProductById, updateProductNotificationIds } from '@/services/storage';

// Use the official AsyncStorage mock for Jest
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Reset AsyncStorage mock before each test
beforeEach(async () => {
  await AsyncStorage.clear();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sampleProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-1',
    barcode: '7891234567890',
    format: 'EAN-13',
    name: 'Leite Integral',
    expirationDate: '2026-12-31',
    createdAt: new Date('2026-07-30T10:00:00Z').toISOString(),
    notificationIds: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getProducts
// ---------------------------------------------------------------------------

describe('getProducts', () => {
  it('returns empty array when no products stored', async () => {
    const products = await getProducts();
    expect(products).toEqual([]);
  });

  it('returns products sorted by expiration date (soonest first)', async () => {
    const p1 = sampleProduct({ id: '1', expirationDate: '2026-12-31', name: 'Leite' });
    const p2 = sampleProduct({ id: '2', expirationDate: '2026-08-15', name: 'Queijo' });
    const p3 = sampleProduct({ id: '3', expirationDate: '2026-10-01', name: 'Iogurte' });

    await AsyncStorage.setItem('@validade/products', JSON.stringify([p1, p2, p3]));

    const products = await getProducts();
    expect(products.map((p) => p.name)).toEqual(['Queijo', 'Iogurte', 'Leite']);
  });
});

// ---------------------------------------------------------------------------
// createProduct
// ---------------------------------------------------------------------------

describe('createProduct', () => {
  it('creates a product and returns it with generated id', async () => {
    const product = await createProduct({
      barcode: '7891234567890',
      format: 'EAN-13',
      name: 'Arroz',
      expirationDate: '2027-01-15',
      notificationIds: [],
    });

    expect(product.id).toBeDefined();
    expect(product.name).toBe('Arroz');
    expect(product.barcode).toBe('7891234567890');
    expect(product.createdAt).toBeDefined();
    expect(product.notificationIds).toEqual([]);
  });

  it('persists the product so getProducts can retrieve it', async () => {
    await createProduct({
      barcode: '789111',
      format: 'Code 128',
      name: 'Feijão',
      expirationDate: '2026-09-01',
      notificationIds: [],
    });

    const products = await getProducts();
    expect(products).toHaveLength(1);
    expect(products[0].name).toBe('Feijão');
  });

  it('appends to existing products', async () => {
    await createProduct({
      barcode: '111',
      format: 'EAN-13',
      name: 'Produto A',
      expirationDate: '2026-10-01',
      notificationIds: [],
    });

    await createProduct({
      barcode: '222',
      format: 'EAN-13',
      name: 'Produto B',
      expirationDate: '2026-11-01',
      notificationIds: [],
    });

    const products = await getProducts();
    expect(products).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// getProductById
// ---------------------------------------------------------------------------

describe('getProductById', () => {
  it('returns null for non-existent id', async () => {
    const product = await getProductById('non-existent');
    expect(product).toBeNull();
  });

  it('returns the product when it exists', async () => {
    const created = await createProduct({
      barcode: '789',
      format: 'EAN-13',
      name: 'Macarrão',
      expirationDate: '2026-12-01',
      notificationIds: [],
    });

    const found = await getProductById(created.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Macarrão');
  });
});

// ---------------------------------------------------------------------------
// deleteProduct
// ---------------------------------------------------------------------------

describe('deleteProduct', () => {
  it('removes a product by id', async () => {
    const p1 = await createProduct({
      barcode: '111',
      format: 'EAN-13',
      name: 'Produto 1',
      expirationDate: '2026-12-01',
      notificationIds: [],
    });

    await createProduct({
      barcode: '222',
      format: 'EAN-13',
      name: 'Produto 2',
      expirationDate: '2026-12-15',
      notificationIds: [],
    });

    await deleteProduct(p1.id);

    const products = await getProducts();
    expect(products).toHaveLength(1);
    expect(products[0].name).toBe('Produto 2');
  });

  it('does nothing when id does not exist', async () => {
    await deleteProduct('non-existent');
    // Should not throw
  });
});

// ---------------------------------------------------------------------------
// updateProductNotificationIds
// ---------------------------------------------------------------------------

describe('updateProductNotificationIds', () => {
  it('updates notification ids for a product', async () => {
    const product = await createProduct({
      barcode: '789',
      format: 'EAN-13',
      name: 'Presunto',
      expirationDate: '2026-11-15',
      notificationIds: [],
    });

    await updateProductNotificationIds(product.id, ['notif-1', 'notif-2']);

    const updated = await getProductById(product.id);
    expect(updated?.notificationIds).toEqual(['notif-1', 'notif-2']);
  });

  it('does nothing when product id does not exist', async () => {
    await updateProductNotificationIds('non-existent', ['notif-1']);
    // Should not throw
  });
});
