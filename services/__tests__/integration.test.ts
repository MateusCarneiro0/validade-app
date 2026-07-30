import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system';

import {
  getProducts,
  createProduct,
  getProductById,
  updateProduct,
  deleteProduct,
} from '@/services/storage';
import {
  scheduleExpirationReminders,
  cancelProductNotifications,
  rescheduleExpirationReminders,
} from '@/services/notifications';
import { fetchProductByBarcode } from '@/services/openfoodfacts';
import { importFromXLSX, validateHeaders } from '@/services/xlsx-parser';
import { daysUntilExpiration } from '@/types/product';

// ===========================================================================
// Mocks
// ===========================================================================

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-file-system', () => ({
  EncodingType: { Base64: 'base64' },
  readAsStringAsync: jest.fn(),
}));

let notifCounter = 0;
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockImplementation(async () => {
    notifCounter++;
    return `notif-integration-${notifCounter}`;
  }),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { HIGH: 4 },
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
}));

// Mock global fetch for Open Food Facts
const mockFetch = jest.fn();
global.fetch = mockFetch;

// ===========================================================================
// Setup
// ===========================================================================

beforeEach(async () => {
  jest.clearAllMocks();
  notifCounter = 0;
  await AsyncStorage.clear();

  // Restore the default mock implementation of scheduleNotificationAsync
  // (jest.clearAllMocks resets call count but NOT the implementation)
  const notifMock = jest.mocked(Notifications.scheduleNotificationAsync);
  notifMock.mockImplementation(async () => {
    notifCounter++;
    return `notif-integration-${notifCounter}`;
  });
});

// ===========================================================================
// HELPER to create a complete product with all fields including imagem
// ===========================================================================

async function createCompleteProduct(overrides: Record<string, unknown> = {}) {
  const data = {
    barcode: '7891234567890',
    format: 'EAN-13',
    name: 'Leite Integral',
    lote: 'LOTE-2026',
    quantidade: 10,
    imagem: 'https://example.com/produto.jpg',
    expirationDate: '2027-06-15',
    notificationIds: [] as string[],
    ...overrides,
  };

  const product = await createProduct(data);
  return product;
}

// ===========================================================================
// SECTION 1: Full product creation with all fields (including photo/imagem)
// ===========================================================================

describe('Fluxo Completo: Cadastro de Produto com Foto', () => {
  it('1.1 - Cria produto com todos os campos (barcode, nome, lote, quantidade, imagem, validade)', async () => {
    const product = await createCompleteProduct();

    expect(product).toBeDefined();
    expect(product.id).toBeTruthy();
    expect(product.barcode).toBe('7891234567890');
    expect(product.format).toBe('EAN-13');
    expect(product.name).toBe('Leite Integral');
    expect(product.lote).toBe('LOTE-2026');
    expect(product.quantidade).toBe(10);
    expect(product.imagem).toBe('https://example.com/produto.jpg');
    expect(product.expirationDate).toBe('2027-06-15');
    expect(product.createdAt).toBeTruthy();
    expect(product.notificationIds).toEqual([]);
  });

  it('1.2 - Produto criado com foto fica persistido e recuperável via getProducts', async () => {
    await createCompleteProduct();

    const products = await getProducts();
    expect(products).toHaveLength(1);
    expect(products[0].imagem).toBe('https://example.com/produto.jpg');
    expect(products[0].lote).toBe('LOTE-2026');
    expect(products[0].quantidade).toBe(10);
  });

  it('1.3 - Produto pode ser criado sem campos opcionais (lote, quantidade, imagem)', async () => {
    const product = await createProduct({
      barcode: '789111',
      format: 'EAN-13',
      name: 'Produto Simples',
      expirationDate: '2027-01-01',
      notificationIds: [],
    });

    expect(product.lote).toBeUndefined();
    expect(product.quantidade).toBeUndefined();
    expect(product.imagem).toBeUndefined();
  });

  it('1.4 - Produto com imagem aparece corretamente ao buscar por ID', async () => {
    const created = await createCompleteProduct();
    const found = await getProductById(created.id);

    expect(found).not.toBeNull();
    expect(found!.imagem).toBe('https://example.com/produto.jpg');
    expect(found!.lote).toBe('LOTE-2026');
    expect(found!.quantidade).toBe(10);
  });

  it('1.5 - Ao cadastrar produto, notificações podem ser agendadas (integração storage + notifications)', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-01T10:00:00Z'));

    const product = await createCompleteProduct({ expirationDate: '2026-09-15' });
    const ids = await scheduleExpirationReminders(product);

    // 30d: 45 >= 30 ✓, 15d: 45 >= 15 ✓, 7d: 45 >= 7 ✓, 0d: 45 >= 0 ✓
    expect(ids).toHaveLength(4);

    // Verify notifications are linked in storage
    const updated = await getProductById(product.id);
    expect(updated?.notificationIds).toEqual(ids);

    jest.useRealTimers();
  });
});

// ===========================================================================
// SECTION 2: Full product editing lifecycle
// ===========================================================================

describe('Fluxo Completo: Edição de Produto', () => {
  it('2.1 - Edita nome do produto', async () => {
    const product = await createCompleteProduct({ name: 'Leite Antigo' });

    const updated = await updateProduct(product.id, { name: 'Leite Novo' });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('Leite Novo');

    // Verify persistence
    const found = await getProductById(product.id);
    expect(found!.name).toBe('Leite Novo');
  });

  it('2.2 - Edita lote e quantidade do produto', async () => {
    const product = await createCompleteProduct({ lote: 'LOTE-A', quantidade: 5 });

    const updated = await updateProduct(product.id, {
      lote: 'LOTE-B',
      quantidade: 20,
    });

    expect(updated!.lote).toBe('LOTE-B');
    expect(updated!.quantidade).toBe(20);

    const found = await getProductById(product.id);
    expect(found!.lote).toBe('LOTE-B');
    expect(found!.quantidade).toBe(20);
  });

  it('2.3 - Edita data de validade e notificações são reagendadas', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-01T10:00:00Z'));

    // Create product with initial date
    const product = await createCompleteProduct({ expirationDate: '2026-12-31' });

    // Schedule initial notifications
    const initialIds = await scheduleExpirationReminders(product);
    expect(initialIds).toHaveLength(4);

    // Update expiration date
    const updated = await updateProduct(product.id, { expirationDate: '2027-03-15' });
    expect(updated).not.toBeNull();

    // Reschedule notifications with the UPDATED product object
    const newIds = await rescheduleExpirationReminders(updated!);

    // Old notifications should have been cancelled
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalled();

    // New notifications should be scheduled
    expect(newIds.length).toBeGreaterThan(0);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();

    jest.useRealTimers();
  });

  it('2.4 - Edita imagem do produto', async () => {
    const product = await createCompleteProduct({
      imagem: 'https://example.com/old.jpg',
    });

    const updated = await updateProduct(product.id, {
      imagem: 'https://example.com/new.jpg',
    });

    expect(updated!.imagem).toBe('https://example.com/new.jpg');

    const found = await getProductById(product.id);
    expect(found!.imagem).toBe('https://example.com/new.jpg');
  });

  it('2.5 - Retorna null ao editar produto inexistente', async () => {
    const result = await updateProduct('non-existent-id', { name: 'Teste' });
    expect(result).toBeNull();
  });

  it('2.6 - Edita produto mesmo quando rescheduleExpirationReminders falha (dados persistem)', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-01T10:00:00Z'));

    const product = await createCompleteProduct({
      name: 'Produto Original',
      expirationDate: '2026-12-31',
    });
    expect(product.name).toBe('Produto Original');

    // Agendar notificações iniciais
    await scheduleExpirationReminders(product);

    // Fazer o scheduleNotificationAsync lançar erro para simular
    // falha no reagendamento (ex: sem permissão no dispositivo)
    const scheduleMock = jest.mocked(Notifications.scheduleNotificationAsync);
    scheduleMock.mockRejectedValue(new Error('Sem permissão de notificação'));

    // Atualizar o produto — mesmo que rescheduleExpirationReminders falhe,
    // os dados do produto DEVEM persistir
    const updated = await updateProduct(product.id, {
      name: 'Produto Editado',
      lote: 'NOVO-LOTE',
      quantidade: 50,
      expirationDate: '2027-06-01',
    });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('Produto Editado');

    // rescheduleExpirationReminders vai falhar (mock rejeita),
    // mas o catch interno não deve propagar o erro
    await expect(rescheduleExpirationReminders(updated!)).resolves.not.toThrow();

    // Verificar que os dados do produto foram salvos mesmo com falha nas notificações
    const found = await getProductById(product.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Produto Editado');
    expect(found!.lote).toBe('NOVO-LOTE');
    expect(found!.quantidade).toBe(50);
    expect(found!.expirationDate).toBe('2027-06-01');

    jest.useRealTimers();
  });

  it('2.7 - Edita produto sem notificações existentes e dados persistem', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-01T10:00:00Z'));

    // Produto SEM notificações agendadas
    const product = await createCompleteProduct({
      name: 'Sem Notificação',
      expirationDate: '2027-12-31',
    });
    // Não agendar notificações — notificationIds = []

    // Editar o produto
    const updated = await updateProduct(product.id, {
      name: 'Editado Sem Notificação',
      quantidade: 100,
    });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('Editado Sem Notificação');
    expect(updated!.quantidade).toBe(100);

    // Agendar notificações após edição (deve funcionar)
    const ids = await rescheduleExpirationReminders(updated!);
    expect(ids.length).toBeGreaterThan(0);

    // Verificar persistência
    const found = await getProductById(product.id);
    expect(found!.name).toBe('Editado Sem Notificação');
    expect(found!.quantidade).toBe(100);

    jest.useRealTimers();
  });
});

// ===========================================================================
// SECTION 3: Full product deletion lifecycle
// ===========================================================================

describe('Fluxo Completo: Exclusão de Produto', () => {
  it('3.1 - Deleta produto e ele desaparece da lista', async () => {
    const p1 = await createCompleteProduct({ name: 'Produto A' });
    const p2 = await createCompleteProduct({ name: 'Produto B' });

    await deleteProduct(p1.id);

    const products = await getProducts();
    expect(products).toHaveLength(1);
    expect(products[0].name).toBe('Produto B');
  });

  it('3.2 - Ao deletar produto com notificações, elas são canceladas', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-01T10:00:00Z'));

    const product = await createCompleteProduct({ expirationDate: '2026-12-31' });
    await scheduleExpirationReminders(product);

    // Re-fetch product to get the updated notificationIds from storage
    const productWithNotifs = await getProductById(product.id);
    expect(productWithNotifs).not.toBeNull();
    expect(productWithNotifs!.notificationIds.length).toBeGreaterThan(0);

    // Cancel notifications and delete
    await cancelProductNotifications(productWithNotifs!);
    await deleteProduct(product.id);

    // Verify notifications were cancelled
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalled();

    // Verify product is gone
    const found = await getProductById(product.id);
    expect(found).toBeNull();

    jest.useRealTimers();
  });
});

// ===========================================================================
// SECTION 4: Open Food Facts integration
// ===========================================================================

describe('Fluxo: Integração Open Food Facts', () => {
  it('4.1 - Retorna dados do produto quando encontrado na API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 1,
        product: {
          product_name: 'Leite Integral Teste',
          image_url: 'https://images.openfoodfacts.org/leite.jpg',
        },
      }),
    });

    const result = await fetchProductByBarcode('7891234567890');

    expect(result.found).toBe(true);
    expect(result.name).toBe('Leite Integral Teste');
    expect(result.imageUrl).toBe('https://images.openfoodfacts.org/leite.jpg');
  });

  it('4.2 - Retorna found=false quando produto não existe na API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 0 }),
    });

    const result = await fetchProductByBarcode('9999999999999');
    expect(result.found).toBe(false);
  });

  it('4.3 - Retorna found=false quando a API falha (erro de rede)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await fetchProductByBarcode('7890000000000');
    expect(result.found).toBe(false);
  });

  it('4.4 - Usa dados da API para completar cadastro do produto via storage', async () => {
    // Simulate CadastroScreen flow: fetch from API then create product
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 1,
        product: {
          product_name: 'Arroz Integral',
          image_url: 'https://images.openfoodfacts.org/arroz.jpg',
        },
      }),
    });

    const apiResult = await fetchProductByBarcode('7891234567890');
    expect(apiResult.found).toBe(true);

    const product = await createProduct({
      barcode: '7891234567890',
      format: 'EAN-13',
      name: apiResult.name!,
      imagem: apiResult.imageUrl,
      lote: 'LOTE-X',
      quantidade: 5,
      expirationDate: '2027-12-31',
      notificationIds: [],
    });

    expect(product.name).toBe('Arroz Integral');
    expect(product.imagem).toBe('https://images.openfoodfacts.org/arroz.jpg');
    expect(product.lote).toBe('LOTE-X');
    expect(product.quantidade).toBe(5);
  });
});

// ===========================================================================
// SECTION 5: XLSX Import flow (mocked file system)
// ===========================================================================

describe('Fluxo Completo: Importação XLSX', () => {
  it('5.1 - validateHeaders retorna válido para colunas corretas', () => {
    const headers = ['Barcode', 'Quantidade', 'Lote', 'Data de Validade'];
    const result = validateHeaders(headers);
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('5.2 - validateHeaders aponta colunas faltantes', () => {
    const headers = ['Barcode', 'Nome'];
    const result = validateHeaders(headers);
    expect(result.valid).toBe(false);
    expect(result.missing).toEqual(['Quantidade', 'Lote', 'Data de Validade']);
  });

  it('5.3 - Importa produtos de planilha com colunas válidas e nome na planilha', async () => {
    // Mock FileSystem to return a minimal valid XLSX as base64
    // We'll create the XLSX buffer using xlsx
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Barcode', 'Quantidade', 'Lote', 'Data de Validade', 'Nome', 'Imagem'],
      ['789100001', '10', 'LOTE-A', '15/12/2026', 'Produto Teste A', 'https://img.com/a.jpg'],
      ['789100002', '5', 'LOTE-B', '20/01/2027', 'Produto Teste B', ''],
      ['', '3', 'LOTE-C', '10/11/2026', 'Sem Barcode', ''],  // ignored: no barcode
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

    const result = await importFromXLSX('file:///test/planilha.xlsx');

    expect(result.successCount).toBe(2);
    expect(result.ignoredCount).toBe(1);
    expect(result.ignoredBarcodes).toEqual([]);

    // Verify products were persisted
    const products = await getProducts();
    expect(products).toHaveLength(2);
    expect(products[0].name).toBe('Produto Teste A');
    expect(products[0].barcode).toBe('789100001');
    expect(products[0].lote).toBe('LOTE-A');
    expect(products[0].quantidade).toBe(10);
    expect(products[0].imagem).toBe('https://img.com/a.jpg');
    expect(products[0].format).toBe('XLSX');
  });

  it('5.4 - Importa produtos com busca automática na Open Food Facts quando nome não informado', async () => {
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Barcode', 'Quantidade', 'Lote', 'Data de Validade', 'Nome', 'Imagem'],
      ['7894900011517', '20', 'LOTE-ABC', '30/06/2027', '', ''],  // no name → will fetch API
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

    // Mock Open Food Facts to return product data for this barcode
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 1,
        product: {
          product_name: 'Coca-Cola',
          image_url: 'https://images.openfoodfacts.org/coca.jpg',
        },
      }),
    });

    const result = await importFromXLSX('file:///test/planilha.xlsx');

    expect(result.successCount).toBe(1);
    expect(result.ignoredCount).toBe(0);

    const products = await getProducts();
    expect(products[0].name).toBe('Coca-Cola');
    expect(products[0].barcode).toBe('7894900011517');
  });

  it('5.5 - Ignora produtos sem nome na planilha e não encontrados na API', async () => {
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Barcode', 'Quantidade', 'Lote', 'Data de Validade', 'Nome', 'Imagem'],
      ['9990000000001', '1', 'LOTE-X', '01/01/2027', '', ''],  // no name, not in API → ignored
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

    // Mock Open Food Facts to return not found
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 0 }),
    });

    const result = await importFromXLSX('file:///test/planilha.xlsx');

    expect(result.successCount).toBe(0);
    expect(result.ignoredCount).toBe(1);
    expect(result.ignoredBarcodes).toEqual(['9990000000001']);
  });

  it('5.6 - Ignora linha com data de validade inválida', async () => {
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Barcode', 'Quantidade', 'Lote', 'Data de Validade', 'Nome', 'Imagem'],
      ['789100001', '10', 'LOTE-A', 'data-invalida', 'Produto X', ''],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

    const result = await importFromXLSX('file:///test/planilha.xlsx');

    expect(result.successCount).toBe(0);
    expect(result.ignoredCount).toBe(1);
    expect(result.ignoredBarcodes).toEqual(['789100001']);
  });

  it('5.7 - Aceita cabeçalhos com nomes alternativos (código, qtd, validade)', async () => {
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Código', 'Qtd', 'Batch', 'Validade', 'Produto'],
      ['789111', '5', 'LOTE-1', '10/10/2026', 'Produto Alternativo'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Dados');
    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

    const result = await importFromXLSX('file:///test/planilha.xlsx');

    expect(result.successCount).toBe(1);
    expect(result.ignoredCount).toBe(0);
  });

  it('5.8 - Lança erro se faltarem colunas obrigatórias', async () => {
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Nome', 'Preço'],
      ['Teste', '10'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(base64);

    await expect(importFromXLSX('file:///test/planilha.xlsx')).rejects.toThrow(
      'Colunas obrigatórias ausentes',
    );
  });
});

// ===========================================================================
// SECTION 6: Complete end-to-end user journey
// ===========================================================================

describe('Jornada Completa do Usuário: Cadastro → Edição → Notificação → Exclusão', () => {
  it('6.1 - Fluxo completo: cria produto com foto, edita lote/qtd, agenda notificações, deleta', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-01T10:00:00Z'));

    // --- STEP 1: Create product with all fields (simulating CadastroScreen) ---
    const product = await createProduct({
      barcode: '7891234567890',
      format: 'EAN-13',
      name: 'Arroz Integral',
      lote: 'LOTE-001',
      quantidade: 25,
      imagem: 'https://example.com/arroz.jpg',
      expirationDate: '2027-01-15',
      notificationIds: [],
    });

    expect(product.name).toBe('Arroz Integral');
    expect(product.imagem).toBe('https://example.com/arroz.jpg');
    expect(product.lote).toBe('LOTE-001');

    // --- STEP 2: Schedule notifications ---
    const notifIds = await scheduleExpirationReminders(product);
    expect(notifIds.length).toBeGreaterThan(0);

    const productWithNotifs = await getProductById(product.id);
    expect(productWithNotifs?.notificationIds.length).toBeGreaterThan(0);

    // --- STEP 3: Edit product (simulating ProdutosScreen edit modal) ---
    const edited = await updateProduct(product.id, {
      name: 'Arroz Integral Premium',
      lote: 'LOTE-002',
      quantidade: 30,
    });
    expect(edited?.name).toBe('Arroz Integral Premium');
    expect(edited?.lote).toBe('LOTE-002');
    expect(edited?.quantidade).toBe(30);

    // --- STEP 4: Reschedule notifications after edit (usando objeto atualizado) ---
    const newNotifIds = await rescheduleExpirationReminders(edited!);
    expect(newNotifIds.length).toBeGreaterThan(0);

    // --- STEP 5: Delete product ---
    await cancelProductNotifications(product);
    await deleteProduct(product.id);

    const found = await getProductById(product.id);
    expect(found).toBeNull();

    // Verify cancellations were called
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalled();

    jest.useRealTimers();
  });

  it('6.2 - Verifica que produtos são ordenados por data de validade (mais próximo primeiro)', async () => {
    await createCompleteProduct({ name: 'Produto C', expirationDate: '2027-06-01' });
    await createCompleteProduct({ name: 'Produto A', expirationDate: '2025-12-31' });
    await createCompleteProduct({ name: 'Produto B', expirationDate: '2026-06-15' });

    const products = await getProducts();
    expect(products[0].name).toBe('Produto A');
    expect(products[1].name).toBe('Produto B');
    expect(products[2].name).toBe('Produto C');
  });
});
