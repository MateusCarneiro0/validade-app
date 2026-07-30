// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenFoodFactsResult {
  found: boolean;
  name?: string;
  imageUrl?: string;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Fetch product data from Open Food Facts by barcode.
 * Returns the product name and image URL if found.
 */
export async function fetchProductByBarcode(barcode: string): Promise<OpenFoodFactsResult> {
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
      { headers: { 'User-Agent': 'ValidadeApp - 1.0.0' } },
    );

    if (!response.ok) {
      return { found: false };
    }

    const data = await response.json();

    if (data.status !== 1) {
      return { found: false };
    }

    const product = data.product;

    return {
      found: true,
      name: product.product_name || product.product_name_en || undefined,
      imageUrl: product.image_url || product.image_small_url || undefined,
    };
  } catch {
    return { found: false };
  }
}
