import { supabase } from '../lib/supabase'

/**
 * Explicit column list — avoids transferring large unused columns (description,
 * benefits, images) on every fetch while keeping all fields the app actually reads.
 */
const PRODUCT_COLUMNS = [
  'id', 'name', 'name_ta', 'tamil_name', 'category', 'category_id',
  'remedy', 'price', 'offer_price', 'unit_type', 'unit_label',
  'base_quantity', 'stock_quantity', 'stock_unit', 'allow_decimal_quantity',
  'predefined_options', 'is_active', 'sort_order', 'unit', 'rating',
  'description', 'description_ta', 'benefits', 'benefits_ta',
  'image', 'image_url', 'sku', 'barcode', 'brand',
  'purchase_price', 'mrp', 'gst_percent', 'opening_stock', 'stock',
  'has_variants', 'item_type'
].join(', ')

export function fetchAllCategories() {
  return supabase
    .from('categories')
    .select('id, name_en')
}

export function fetchAllProducts() {
  return supabase
    .from('products')
    .select(PRODUCT_COLUMNS)
    .order('sort_order', { ascending: true })
}
