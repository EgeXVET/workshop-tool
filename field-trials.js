/* Field Experience
   Source of truth: data/xvet_field_trials_complete.csv
   Matching and display are deterministic; no claims or calculations are generated. */

const FIELD_TRIALS_CSV_URL = 'data/xvet_field_trials_complete.csv';
let FIELD_TRIALS = [];
let FIELD_TRIALS_LOADED = false;
let FIELD_TRIALS_LOAD_ERROR = null;

const SPECIES_KEY_TO_TRIAL = {
  b: ['broiler'],
  l: ['layer'],
  r: ['ruminant'],
  s: ['swine'],
  a: ['aquaculture']
};

const FIELD_CHALLENGE_MAP = {
  'respiratory pressure': ['respiratory-pressure'],
  'respiratory challenges': ['respiratory-pressure'],
  'mortality': ['mortality'],
  'heat stress': ['heat-stress'],
  'heat stress & dehydration': ['heat-stress'],
  'fcr / weight gain': ['fcr-weight-gain'],
  'growth & feed efficiency': ['fcr-weight-gain'],
  'gut health': ['gut-health'],
  'gut health & digestion': ['gut-health'],
  'vaccine reaction': ['vaccine-reaction'],
  'egg performance': ['egg-performance'],
  'eggshell quality': ['eggshell-quality'],
  'eggshell & egg quality': ['eggshell-quality','egg-performance'],
  'mycotoxins': ['mycotoxins'],
  'mycotoxin challenges': ['mycotoxins'],
  'feed storage & mould': ['feed-storage-mould'],
  'feed storage & mold': ['feed-storage-mould'],
  'feed preservation & mould': ['feed-storage-mould'],
  'leg problems': ['leg-problems'],
  'bone, leg & mineral health': ['leg-problems','eggshell-quality'],
  'liver / kidney stress': ['liver-kidney-stress'],
  'liver & metabolic health': ['liver-kidney-stress'],
  'kidney & renal health': ['liver-kidney-stress'],
  'antibiotic reduction': ['antibiotic-reduction'],
  'calf / piglet start': ['calf-piglet-start'],
  'early-life & young-animal support': ['calf-piglet-start'],
  'water quality': ['water-quality'],
  'water quality & hygiene': ['water-quality'],
  'carcass quality': ['carcass-quality'],
  'milk yield': ['milk-yield'],
  'milk & lactation performance': ['milk-yield']
};

function normalizeChallengeLabel(label) {
  const key = String(label || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!key) return [];
  return FIELD_CHALLENGE_MAP[key] || [];
}

function parseFieldTrialsCSV(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const parseLine = line => {
    const out = [];
    let value = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') {
          value += '"';
          i++;
        } else if (ch === '"') {
          quoted = false;
        } else {
          value += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ',') {
        out.push(value);
        value = '';
      } else {
        value += ch;
      }
    }
    out.push(value);
    return out;
  };
  const headers = parseLine(lines[0]);
  return lines.slice(1).filter(Boolean).map(line => {
    const values = parseLine(line);
    const row = {};
    headers.forEach((header, index) => { row[header] = values[index] || ''; });
    return row;
  });
}

function indexFieldTrials(rows) {
  const grouped = new Map();
  rows.forEach(row => {
    if (!row.trial_id) return;
    if (!grouped.has(row.trial_id)) {
      grouped.set(row.trial_id, {
        trial_id: row.trial_id,
        product_ids: row.product_ids.split('|').filter(Boolean),
        display_product: row.display_product,
        historical_product_name: row.historical_product_name,
        species_tags: row.species_tags.split('|').filter(Boolean),
        challenge_tags: row.challenge_tags.split('|').filter(Boolean),
        country: row.country,
        year: row.year,
        sample_size: row.sample_size,
        duration: row.duration,
        dosage: row.dosage,
        comparator: row.comparator,
        evidence_type: row.evidence_type,
        evidence_strength: Number(row.evidence_strength) || 0,
        headline: row.headline,
        customer_facing_summary: row.customer_facing_summary,
        source_pdf_pages: row.source_pdf_pages,
        source_document: row.source_document,
        results: []
      });
    }
    grouped.get(row.trial_id).results.push({
      result_index: Number(row.result_index) || 0,
      result_metric: row.result_metric,
      control_value: row.control_value,
      treatment_value: row.treatment_value,
      unit: row.unit,
      effect_or_note: row.effect_or_note
    });
  });
  FIELD_TRIALS = [...grouped.values()].map(trial => ({
    ...trial,
    results: trial.results.sort((a, b) => a.result_index - b.result_index)
  }));
  FIELD_TRIALS_LOADED = true;
}

async function loadFieldTrialsCSV() {
  FIELD_TRIALS_LOAD_ERROR = null;
  try {
    let text;
    if (location.protocol === 'file:' && typeof FIELD_TRIALS_CSV_EMBED === 'string' && FIELD_TRIALS_CSV_EMBED.length) {
      text = FIELD_TRIALS_CSV_EMBED;
    } else {
      try {
        const response = await fetch(FIELD_TRIALS_CSV_URL, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        text = await response.text();
      } catch (fetchError) {
        if (typeof FIELD_TRIALS_CSV_EMBED === 'string' && FIELD_TRIALS_CSV_EMBED.length) {
          text = FIELD_TRIALS_CSV_EMBED;
        } else {
          throw fetchError;
        }
      }
    }
    indexFieldTrials(parseFieldTrialsCSV(text));
  } catch (error) {
    FIELD_TRIALS = [];
    FIELD_TRIALS_LOADED = false;
    FIELD_TRIALS_LOAD_ERROR = error.message || String(error);
  }
}

function getFieldExperienceMatches(productId, context, selectedCountry) {
  if (!FIELD_TRIALS_LOADED || !productId) return [];
  const shares = context.speciesShares || {};
  const selectedSpecies = Object.keys(shares).filter(species => shares[species] > 0);
  const selectedChallenges = context.challenges || [];
  if (!selectedSpecies.length) return [];

  return FIELD_TRIALS
    .filter(trial => trial.product_ids.includes(productId))
    .map(trial => {
      const matchingSpecies = trial.species_tags.filter(species => selectedSpecies.includes(species));
      if (!matchingSpecies.length) return null;
      const matchingChallenges = trial.challenge_tags.filter(challenge => selectedChallenges.includes(challenge));
      if (selectedChallenges.length && !matchingChallenges.length) return null;

      const speciesShare = Math.max(...matchingSpecies.map(species => shares[species] || 0));
      const sameCountry = String(trial.country).toLowerCase() === String(selectedCountry || '').toLowerCase();
      const score = 100 + 60 + (80 * matchingChallenges.length)
        + trial.evidence_strength + (sameCountry ? 10 : 0);
      return { ...trial, score, speciesShare, matchingSpecies, matchingChallenges };
    })
    .filter(Boolean)
    .sort((a, b) =>
      b.score - a.score
      || b.speciesShare - a.speciesShare
      || (Number(b.year) || 0) - (Number(a.year) || 0)
      || a.trial_id.localeCompare(b.trial_id)
    )
    .slice(0, 2);
}

function fieldEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fieldValue(value, unit) {
  if (value === '') return '';
  return `${fieldEscape(value)}${unit ? ` <span>${fieldEscape(unit)}</span>` : ''}`;
}

function strongestNumericResults(trial) {
  const numeric = trial.results.filter(result =>
    /\d/.test(`${result.control_value} ${result.treatment_value} ${result.effect_or_note}`)
  );
  const baseMetrics = new Set(numeric.map(result =>
    result.result_metric.toLowerCase().replace(/^control\s+/, '').trim()
  ));
  return numeric
    .filter(result => {
      const metric = result.result_metric.toLowerCase().trim();
      return !metric.startsWith('control ') || !baseMetrics.has(metric.replace(/^control\s+/, ''));
    })
    .slice(0, 3);
}

function renderFieldMetric(result) {
  const control = fieldValue(result.control_value, result.unit);
  const treatment = fieldValue(result.treatment_value, result.unit);
  let values = '';
  if (control && treatment) {
    values = `<div class="fe-values"><b>${control}</b><span class="fe-arrow">&rarr;</span><b>${treatment}</b></div>`;
  } else if (treatment) {
    values = `<div class="fe-values"><b>${treatment}</b></div>`;
  } else if (control) {
    values = `<div class="fe-values"><b>${control}</b></div>`;
  }
  const effect = result.effect_or_note
    ? `<div class="fe-effect">${fieldEscape(result.effect_or_note)}</div>`
    : '';
  return `<div class="fe-result">
    <div class="fe-result-label">${fieldEscape(result.result_metric)}</div>
    ${values}${effect}
  </div>`;
}

function renderFieldTrial(trial, label) {
  const sample = trial.sample_size
    ? (/^\d+$/.test(trial.sample_size)
        ? Number(trial.sample_size).toLocaleString('en-US')
        : trial.sample_size)
    : '';
  const speciesLabel = {
    broiler: 'broilers',
    layer: 'layers',
    ruminant: 'ruminants',
    swine: 'swine',
    aquaculture: 'aquaculture animals'
  }[trial.matchingSpecies[0]] || 'animals';
  const facts = [
    trial.country,
    trial.year,
    sample ? `${sample} ${speciesLabel}` : '',
    trial.duration,
    trial.dosage
  ].filter(Boolean);
  const metrics = strongestNumericResults(trial);
  return `<article class="fe-trial">
    <div class="fe-overline">${fieldEscape(label)}</div>
    <h4>${fieldEscape(trial.headline)}</h4>
    <div class="fe-product">${fieldEscape(trial.display_product)}</div>
    <div class="fe-facts">${facts.map(fact => `<span>${fieldEscape(fact)}</span>`).join('')}</div>
    <div class="fe-summary-label">Customer summary</div>
    <p class="fe-summary">${fieldEscape(trial.customer_facing_summary)}</p>
    ${metrics.length ? `<div class="fe-results">${metrics.map(renderFieldMetric).join('')}</div>` : ''}
  </article>`;
}

function fieldHighlight(trial) {
  const results = strongestNumericResults(trial);
  const result = results.find(item => {
    const effect = String(item.effect_or_note || '').trim();
    return /^[+\-?~<>]?\d/.test(effect)
      && (effect.match(/\d+(?:[.,]\d+)?/g) || []).length === 1;
  }) || results[0];
  if (!result) return '';

  let value = '';
  if (/^[+\-?~<>]?\d/.test(String(result.effect_or_note || '').trim())) {
    value = result.effect_or_note;
  } else if (result.treatment_value) {
    value = `${result.treatment_value}${result.unit ? ` ${result.unit}` : ''}`;
  } else if (result.control_value) {
    value = `${result.control_value}${result.unit ? ` ${result.unit}` : ''}`;
  }
  if (!value) return '';

  return `<div class="fe-highlight">
    <div>
      <div class="fe-overline">Field Experience</div>
      <div class="fe-highlight-context">${fieldEscape(trial.display_product)} | ${fieldEscape(trial.country)}${trial.year ? ` | ${fieldEscape(trial.year)}` : ''}</div>
    </div>
    <div class="fe-highlight-result">
      <b>${fieldEscape(value)}</b>
      <span>${fieldEscape(result.result_metric)}</span>
    </div>
  </div>`;
}

function renderFieldExperienceHTML(productObj, context, selectedCountry) {
  const matches = getFieldExperienceMatches(productObj.id, context, selectedCountry);
  if (!matches.length) return '';
  return `<section class="field-experience">
    ${fieldHighlight(matches[0])}
    <details class="fe-collapse">
      <summary>
        <span>View field experience</span>
        <span class="fe-count">${matches.length} trial${matches.length > 1 ? 's' : ''}</span>
      </summary>
      <div class="fe-collapse-body">
        ${renderFieldTrial(matches[0], 'Best field evidence')}
        ${matches[1] ? renderFieldTrial(matches[1], 'More field experience') : ''}
      </div>
    </details>
  </section>`;
}
