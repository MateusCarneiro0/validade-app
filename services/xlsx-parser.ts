import * as FileSystem from 'expo-file-system';
import * as XLSX from 'xlsx';
import { fetchProductByBarcode } from '@/services/openfoodfacts';
import { createProduct } from '@/services/storage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface XLSXRow {
  Barcode?: string;
  Quantidade?: string | number;
  Lote?: string;
  'Data de Validade'?: string;
  Nome?: string;
  Imagem?: string;
}

export interface ImportResult {
  successCount: number;
  ignoredCount: number;
  ignoredBarcodes: string[];
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const REQUIRED_COLUMNS = ['Barcode', 'Quantidade', 'Lote', 'Data de Validade'];

/**
 * Validate that the parsed headers contain all required columns.
 */
export function validateHeaders(headers: string[]): { valid: boolean; missing: string[] } {
  const missing = REQUIRED_COLUMNS.filter((col) => !headers.includes(col));
  return { valid: missing.length === 0, missing };
}

/**
 * Parse a date string in DD/MM/AAAA format into YYYY-MM-DD.
 */
function parseDate(value: string | number | undefined): string | null {
  if (!value) return null;

  // If it's a number (Excel serial date), convert it
  if (typeof value === 'number') {
    // Excel tem um bug conhecido: trata 1900 como ano bissexto (serial 60 = 29/Fev/1900
    // que não existiu). Para seriais > 60, subtraímos 1 para corrigir o deslocamento.
    // Como as datas de validade são sempre futuras (2024+), a correção sempre se aplica.
    const serialDate = value > 60 ? value - 1 : value;
    const date = new Date((serialDate - 25569) * 86400 * 1000);
    if (isNaN(date.getTime())) return null;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  // String format DD/MM/AAAA
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const [, d, m, y] = match;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Normalize row keys (case-insensitive) to our expected column names.
 */
function normalizeRow(row: Record<string, unknown>): XLSXRow {
  const keyMap: Record<string, keyof XLSXRow> = {};
  for (const key of Object.keys(row)) {
    const lower = key.trim().toLowerCase();
    if (lower === 'barcode' || lower === 'código' || lower === 'codigo' || lower === 'cod' || lower === 'code') {
      keyMap[key] = 'Barcode';
    } else if (lower === 'quantidade' || lower === 'qtd' || lower === 'quantity' || lower === 'qty') {
      keyMap[key] = 'Quantidade';
    } else if (lower === 'lote' || lower === 'batch' || lower === 'lot') {
      keyMap[key] = 'Lote';
    } else if (lower === 'data de validade' || lower === 'validade' || lower === 'expiration date' || lower === 'expiry date' || lower === 'expiry' || lower === 'data') {
      keyMap[key] = 'Data de Validade';
    } else if (lower === 'nome' || lower === 'name' || lower === 'product name' || lower === 'produto' || lower === 'description' || lower === 'descrição') {
      keyMap[key] = 'Nome';
    } else if (lower === 'imagem' || lower === 'image' || lower === 'image url' || lower === 'url' || lower === 'foto') {
      keyMap[key] = 'Imagem';
    }
  }

  const normalized: Record<string, unknown> = {};
  for (const [originalKey, newKey] of Object.entries(keyMap)) {
    normalized[newKey] = row[originalKey];
  }
  return normalized as XLSXRow;
}

/**
 * Pick an .xlsx file, parse it, validate columns, fetch from Open Food Facts,
 * and import products in batch.
 */
export async function importFromXLSX(fileUri: string): Promise<ImportResult> {
  // Read file as base64
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Parse workbook
  const workbook = XLSX.read(base64, { type: 'base64' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('A planilha está vazia ou não contém abas.');
  }

  const worksheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

  if (rawRows.length === 0) {
    throw new Error('A planilha não contém dados.');
  }

  // Normalize rows
  const rows = rawRows.map(normalizeRow);

  // Validate headers from the first row's actual keys
  const firstRowKeys = Object.keys(rows[0]) as string[];
  const validation = validateHeaders(firstRowKeys);
  if (!validation.valid) {
    throw new Error(
      `Colunas obrigatórias ausentes: ${validation.missing.join(', ')}.\n\nColunas encontradas: ${firstRowKeys.join(', ')}`,
    );
  }

  // Process each row
  let successCount = 0;
  let ignoredCount = 0;
  const ignoredBarcodes: string[] = [];

  for (const row of rows) {
    const barcode = row.Barcode?.toString().trim();
    if (!barcode) {
      ignoredCount++;
      continue;
    }

    const expirationDate = parseDate(row['Data de Validade']);
    if (!expirationDate) {
      ignoredCount++;
      ignoredBarcodes.push(barcode);
      continue;
    }

    const quantidade = row.Quantidade ? Number(row.Quantidade) : undefined;
    const lote = row.Lote?.toString().trim();

    let name = row.Nome?.toString().trim();
    let imagem = row.Imagem?.toString().trim();

    // If name not provided, try to fetch from Open Food Facts
    if (!name) {
      const apiResult = await fetchProductByBarcode(barcode);
      if (apiResult.found) {
        name = apiResult.name || `Produto ${barcode}`;
        if (!imagem && apiResult.imageUrl) {
          imagem = apiResult.imageUrl;
        }
      } else {
        // Product not found and no name provided → ignore
        ignoredCount++;
        ignoredBarcodes.push(barcode);
        continue;
      }
    }

    // If name is still empty, ignore
    if (!name) {
      ignoredCount++;
      ignoredBarcodes.push(barcode);
      continue;
    }

    // Save product
    await createProduct({
      barcode,
      format: 'XLSX',
      name,
      lote,
      quantidade: quantidade && !isNaN(quantidade) ? quantidade : undefined,
      imagem,
      expirationDate,
      notificationIds: [],
    });

    successCount++;
  }

  return { successCount, ignoredCount, ignoredBarcodes };
}
