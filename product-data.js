/* Product catalogue
   Product metadata source: data/product_scoring_master.csv
   Challenge source: data/product_challenge_classification_v3.csv
   Primary and secondary challenges both participate in matching and scoring.
   BCG categories are verified from XVET Product Analysis (1).csv only — unclassified products score 0. */

const PRODUCT_SCORING_CSV_URL = 'data/product_scoring_master.csv';
const PRODUCT_CHALLENGES_CSV_URL = 'data/product_challenge_classification_v3.csv';
// Legacy challenge source (disabled): the Main Challenge column in product_scoring_master.csv.
let PRODUCTS = [];
let CHALLENGE_CHIPS = [];
let PRODUCTS_LOADED = false;
let PRODUCTS_LOAD_ERROR = null;

const PRODUCT_ID_ALIASES = {
  'smooth-pro-calm-me': ['smooth-pro']
};

const BCG_CATEGORY = {
  '42-degree':'STAR',
  'aromax':'STAR',
  'renal-cleaner':'STAR',
  'turbo-fluid':'STAR',
  'cal-d-phos':'CASH COW',
  'turbo-grow':'CASH COW',
  'novosol':'QUESTION MARK',
  'mould-guard-diamond':'QUESTION MARK',
  'growaqua':'QUESTION MARK',
  'globiotic':'QUESTION MARK',
  'e-hydrolyte-c':'QUESTION MARK',
  'hepatisafe':'QUESTION MARK',
  'mineral-forte':'QUESTION MARK',
  'pro-start':'QUESTION MARK',
  'vital-x':'QUESTION MARK',
  'zincotin':'QUESTION MARK',
  'vitaquamix':'QUESTION MARK',
  'metavolin-herbal':'PET',
  'toxi-guard-protect-se':'PET',
  'aromax-dry':'PET',
  'bacflora-br':'PET',
  'vitamin-e-se':'PET',
  'tannifit-plus':'PET',
  'vitamin-ad3eck':'PET',
  'calcium-top':'PET',
  'ovostrong':'PET',
  'vital-bee':'PET'
};

function parseProductCSV(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const parseLine = line => {
    const out = [];
    let value = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { value += '"'; i++; }
        else if (ch === '"') quoted = false;
        else value += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { out.push(value); value = ''; }
      else value += ch;
    }
    out.push(value);
    return out;
  };
  const headers = parseLine(lines[0]).map(h => h.trim());
  return lines.slice(1).filter(Boolean).map(line => {
    const values = parseLine(line);
    const row = {};
    headers.forEach((header, index) => { row[header] = values[index] || ''; });
    return row;
  });
}

function csvFlag(value) {
  return /^(true|1|yes)$/i.test(String(value || '').trim());
}

function csvParts(value) {
  return String(value || '')
    .split(/\s*·\s*|\s*\|\s*/)
    .map(part => part.trim())
    .filter(Boolean);
}

function csvForm(value) {
  const raw = String(value || '').trim();
  if (/liquid/i.test(raw)) return 'Liquid';
  if (/^(wsp)$/i.test(raw) || /soluble/i.test(raw)) return 'Water-Soluble Powder';
  if (/powder/i.test(raw)) return 'Powder';
  return raw;
}

function csvPackaging(value) {
  return String(value || '')
    .replace(/\s*Present in over[\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function csvGroup(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'feed') return 'FEED';
  if (raw === 'health') return 'HEALTH';
  return 'FARM';
}

function normalizedProductKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[®™]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function csvSpecies(row, mainChallenge) {
  const species = [];
  if (csvFlag(row['Poultry'] || row['Poultry '])) { species.push('b', 'l'); }
  if (csvFlag(row.Ruminants)) species.push('r');
  if (csvFlag(row.Swine)) species.push('s');
  if (csvFlag(row.Aquaculture) || /aquaculture/i.test(mainChallenge || '')) {
    if (!species.includes('a')) species.push('a');
  }
  return species;
}

function mapProductRow(row) {
  const id = String(row['slug-id'] || '').trim();
  const name = String(row['Product name'] || '').trim();
  const mainChallenge = String(row['Main Challenge'] || '').trim();
  const core = csvParts(row['Core Benefit']);
  const extra = csvParts(row['Non-Focus Benefits']);
  const form = csvForm(row.FORM);
  const group = csvGroup(row.Category);
  const positioning = String(row.Positioning || '').trim().toUpperCase();
  const description = String(row.Description || '').trim();
  const tagline = String(row.Tagline || '').trim() || core[0] || mainChallenge || '';
  const hasWebsitePage = Boolean(String(row['Website slug'] || '').trim());
  return {
    id,
    name,
    group,
    form,
    tagline,
    solutions: core.slice(0, 3),
    species: csvSpecies(row, mainChallenge),
    img: hasWebsitePage ? 'assets/' + id + '.png' : '',
    // Legacy: ch: mainChallenge ? [mainChallenge] : [],
    ch: [],
    primaryChallenge: '',
    secondaryChallenges: [],
    feature: description,
    benefits: [...core, ...extra],
    pack: csvPackaging(row.Packaging),
    args: extra,
    newCustomerCategory: positioning === 'ENTRY' || positioning === 'GROWTH' ? positioning : ''
  };
}

function applyProductChallenges(products, challengeRows) {
  const byName = new Map(challengeRows.map(row => [
    normalizedProductKey(row['Product name']),
    row
  ]));
  products.forEach(product => {
    const row = byName.get(normalizedProductKey(product.name));
    if (!row) return;
    const primary = String(row['Primary Main Challenge'] || '').trim();
    const secondary = csvParts(row['Secondary Main Challenges']);
    product.primaryChallenge = primary;
    product.secondaryChallenges = secondary;
    product.ch = [...new Set([primary, ...secondary].filter(Boolean))];
    const form = csvForm(row.Form);
    if (form) product.form = form;
    product.species = csvSpecies(row, primary);
    const group = csvGroup(row['Product Group']);
    if (group) product.group = group;
    const positioning = String(row.Positioning || '').trim().toUpperCase();
    if (positioning === 'ENTRY' || positioning === 'GROWTH')
      product.newCustomerCategory = positioning;
  });
}

function indexProducts(rows, challengeRows) {
  PRODUCTS = rows.map(mapProductRow).filter(p => p.id && p.name);
  applyProductChallenges(PRODUCTS, challengeRows);
  const seen = new Set();
  CHALLENGE_CHIPS = PRODUCTS
    .flatMap(p => p.ch)
    .filter(label => {
      if (!label || seen.has(label)) return false;
      seen.add(label);
      return true;
    })
    .sort((a, b) => a.localeCompare(b));
  PRODUCTS_LOADED = true;
}

async function loadCSVWithFallback(url, embedded) {
  if (location.protocol === 'file:' && typeof embedded === 'string' && embedded.length) {
    return embedded;
  }
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } catch (fetchError) {
    if (typeof embedded === 'string' && embedded.length) return embedded;
    throw fetchError;
  }
}

async function loadProductScoringCSV() {
  PRODUCTS_LOAD_ERROR = null;
  try {
    const productEmbed = typeof PRODUCT_SCORING_CSV_EMBED === 'string' ? PRODUCT_SCORING_CSV_EMBED : '';
    const challengeEmbed = typeof PRODUCT_CHALLENGES_CSV_EMBED === 'string' ? PRODUCT_CHALLENGES_CSV_EMBED : '';
    const [productText, challengeText] = await Promise.all([
      loadCSVWithFallback(PRODUCT_SCORING_CSV_URL, productEmbed),
      loadCSVWithFallback(PRODUCT_CHALLENGES_CSV_URL, challengeEmbed)
    ]);
    indexProducts(parseProductCSV(productText), parseProductCSV(challengeText));
  } catch (error) {
    PRODUCTS = [];
    CHALLENGE_CHIPS = [];
    PRODUCTS_LOADED = false;
    PRODUCTS_LOAD_ERROR = error.message || String(error);
  }
}

function productLookupIds(productId) {
  return [productId, ...(PRODUCT_ID_ALIASES[productId] || [])];
}
