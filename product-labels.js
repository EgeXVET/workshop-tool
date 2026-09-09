/* Product Labels
   Source of truth: data/product_labels.json
   Extracted from Product Labels Aug 31 2026 (label artwork).
   Fields: activity, analyticalConstituents (0% rows dropped), additives,
   composition, feedingRecommendation. */

const PRODUCT_LABELS_JSON_URL = 'data/product_labels.json';
let PRODUCT_LABELS = {};
let PRODUCT_LABELS_LOADED = false;
let PRODUCT_LABELS_LOAD_ERROR = null;

function indexProductLabels(payload) {
  PRODUCT_LABELS = {};
  const products = (payload && payload.products) || [];
  products.forEach(row => {
    if (!row || !row.id) return;
    PRODUCT_LABELS[row.id] = row;
  });
  PRODUCT_LABELS_LOADED = true;
}

async function loadProductLabels() {
  PRODUCT_LABELS_LOAD_ERROR = null;
  const embed = (typeof PRODUCT_LABELS_EMBED === 'object' && PRODUCT_LABELS_EMBED) ? PRODUCT_LABELS_EMBED : null;
  try {
    let payload = embed;
    if (typeof location === 'object' && location.protocol !== 'file:') {
      try {
        const response = await fetch(PRODUCT_LABELS_JSON_URL, { cache: 'no-store' });
        if (response.ok) payload = await response.json();
      } catch (fetchError) {
        if (!payload) throw fetchError;
      }
    }
    if (!payload) throw new Error('Product Labels data not found');
    indexProductLabels(payload);
  } catch (error) {
    PRODUCT_LABELS = {};
    PRODUCT_LABELS_LOADED = false;
    PRODUCT_LABELS_LOAD_ERROR = error.message || String(error);
    if (embed) indexProductLabels(embed);
  }
}

function getProductLabel(productId) {
  if (PRODUCT_LABELS[productId]) return PRODUCT_LABELS[productId];
  const ids = typeof productLookupIds === 'function' ? productLookupIds(productId) : [productId];
  for (const id of ids) {
    if (PRODUCT_LABELS[id]) return PRODUCT_LABELS[id];
  }
  if (typeof PRODUCT_ID_ALIASES === 'object') {
    for (const [id, aliases] of Object.entries(PRODUCT_ID_ALIASES)) {
      if (id === productId || (aliases || []).includes(productId)) {
        if (PRODUCT_LABELS[id]) return PRODUCT_LABELS[id];
      }
    }
  }
  return null;
}
