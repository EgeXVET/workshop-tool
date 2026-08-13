/* Product catalogue
   Source of truth: data/product_scoring_master.csv
   Scoring fields (species, form, group, challenges, Entry/Growth) come from that sheet.
   BCG categories are verified from XVET Product Analysis (1).csv only — unclassified products get the default score. */

const PRODUCT_SCORING_CSV_URL = 'data/product_scoring_master.csv';
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
  if (/soluble/i.test(raw)) return 'Water-soluble';
  if (/powder/i.test(raw)) return 'Powder';
  return raw;
}

function csvGroup(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'feed') return 'FEED';
  if (raw === 'health') return 'HEALTH';
  return 'FARM';
}

function csvSpecies(row, mainChallenge) {
  const species = [];
  if (csvFlag(row['Poultry'] || row['Poultry '])) { species.push('b', 'l'); }
  if (csvFlag(row.Ruminants)) species.push('r');
  if (csvFlag(row.Swine)) species.push('s');
  if (/aquaculture/i.test(mainChallenge) && !species.includes('a')) species.push('a');
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
    ch: mainChallenge ? [mainChallenge] : [],
    feature: description,
    benefits: [...core, ...extra],
    pack: String(row.Packaging || '').trim(),
    args: extra.length ? extra : core,
    newCustomerCategory: positioning === 'ENTRY' || positioning === 'GROWTH' ? positioning : ''
  };
}

function indexProducts(rows) {
  PRODUCTS = rows.map(mapProductRow).filter(p => p.id && p.name);
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

async function loadProductScoringCSV() {
  PRODUCTS_LOAD_ERROR = null;
  try {
    let text;
    try {
      const response = await fetch(PRODUCT_SCORING_CSV_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      text = await response.text();
    } catch (fetchError) {
      if (typeof PRODUCT_SCORING_CSV_EMBED === 'string' && PRODUCT_SCORING_CSV_EMBED.length) {
        text = PRODUCT_SCORING_CSV_EMBED;
      } else {
        throw fetchError;
      }
    }
    indexProducts(parseProductCSV(text));
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
