/* Field Experience
   Source of truth: data/field_trials_master24_mapped.csv
   Challenge matching uses the mapped "Maps to Master 24" labels directly.
   Matching and display are deterministic; no claims or calculations are generated. */

const FIELD_TRIALS_CSV_URL = 'data/field_trials_master24_mapped.csv';
// Legacy field-trial source (disabled): data/XERP_Field_Trials_percent_standardized.csv
const FIELD_TRIAL_LIMIT = 2;
const FIELD_TRIAL_LIMIT_STRONG = 5;
/* 160 base + 80 per overlapping challenge. Extra trials (3–5) require at least one challenge match. */
const FIELD_TRIAL_STRONG_MIN_SCORE = 240;
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

/* Legacy FIELD_CHALLENGE_MAP disabled: mapped Master 24 labels now match the
   product classification labels directly, so no intermediate tag translation is needed. */
function normalizeChallengeLabel(label) {
  const value = String(label || '').replace(/\s+/g, ' ').trim();
  return value ? [value] : [];
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
  const headers = parseLine(lines[0]).map(header => header.replace(/^\uFEFF/, ''));
  return lines.slice(1).filter(Boolean).map(line => {
    const values = parseLine(line);
    const row = {};
    headers.forEach((header, index) => { row[header] = values[index] || ''; });
    return row;
  });
}

function csvYes(value) {
  return /^(yes|true|1)$/i.test(String(value || '').trim());
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
        // Legacy tags are retained for traceability but are no longer matched.
        legacy_challenge_tags: row.challenge_tags.split('|').filter(Boolean),
        master_challenges: String(row['Maps to Master 24'] || '').split('|').map(value => value.trim()).filter(Boolean),
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
      effect_or_note: row.effect_or_note,
      improvement_direction: row.improvement_direction || '',
      absolute_change: row.absolute_change || '',
      relative_change_percent: row.relative_change_percent || '',
      benefit_improvement_percent: row.benefit_improvement_percent || '',
      improvement_display_value: row.improvement_display_value || '',
      improvement_display_unit: row.improvement_display_unit || '',
      improvement_display_text: row.improvement_display_text || '',
      improvement_source: row.improvement_source || '',
      front_display_eligible: csvYes(row.front_display_eligible),
      front_display_primary: csvYes(row.front_display_primary),
      headline_percent_value: row.headline_percent_value || '',
      headline_percent_text: row.headline_percent_text || '',
      headline_metric_label: row.headline_metric_label || '',
      headline_context: row.headline_context || '',
      percent_display_valid: csvYes(row.percent_display_valid)
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

  const ranked = FIELD_TRIALS
    .filter(trial => trial.product_ids.includes(productId))
    .map(trial => {
      const matchingSpecies = trial.species_tags.filter(species => selectedSpecies.includes(species));
      if (!matchingSpecies.length) return null;
      const matchingChallenges = trial.master_challenges.filter(challenge => selectedChallenges.includes(challenge));
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
    );

  const base = ranked.slice(0, FIELD_TRIAL_LIMIT);
  const extras = ranked.slice(FIELD_TRIAL_LIMIT)
    .filter(trial => trial.score >= FIELD_TRIAL_STRONG_MIN_SCORE)
    .slice(0, FIELD_TRIAL_LIMIT_STRONG - FIELD_TRIAL_LIMIT);
  return base.concat(extras);
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

function renderFieldTrial(trial) {
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
    <h4>${fieldEscape(trialDisplayHeadline(trial))}</h4>
    <div class="fe-product">${fieldEscape(trial.display_product)}</div>
    <div class="fe-facts">${facts.map(fact => `<span>${fieldEscape(fact)}</span>`).join('')}</div>
    <div class="fe-summary-label">Customer summary</div>
    <p class="fe-summary">${fieldEscape(trial.customer_facing_summary)}</p>
    ${metrics.length ? `<div class="fe-results">${metrics.map(renderFieldMetric).join('')}</div>` : ''}
  </article>`;
}

function primaryFrontResult(trial) {
  return (trial.results || []).find(result =>
    result.front_display_primary
    && result.front_display_eligible
    && String(result.improvement_display_value || '').trim()
  ) || null;
}

function percentHeadlineParts(result) {
  if (!result || !result.percent_display_valid) return null;
  const value = String(result.headline_percent_text || '').trim();
  if (!value) return null;
  const label = String(result.headline_metric_label || '').trim();
  const context = String(result.headline_context || '').trim();
  return { value, label, context };
}

function trialDisplayHeadline(trial) {
  const primary = percentHeadlineParts(primaryFrontResult(trial));
  if (primary) return primary.label ? `${primary.value} ${primary.label}` : primary.value;
  const fallback = (trial.results || []).map(percentHeadlineParts).find(Boolean);
  if (fallback) return fallback.label ? `${fallback.value} ${fallback.label}` : fallback.value;
  return trial.headline;
}

function formatImprovementKpi(result) {
  const percent = percentHeadlineParts(result);
  if (percent) return percent.value;
  const raw = String(result.improvement_display_value || '').trim();
  if (!raw) return '';
  const unit = String(result.improvement_display_unit || '')
    .replace(/\s+vs\s+(control|comparator)\s*$/i, '')
    .trim();
  const text = String(result.improvement_display_text || '').trim();
  const unsigned = raw.replace(/^[+\-−]\s*/, '');
  if (!unsigned) return '';
  const unitSuffix = !unit ? '' : (unit === '%' ? '%' : ` ${unit}`);
  let sign = '+';
  if (result.improvement_direction === 'lower_better') sign = '−';
  if (result.improvement_direction === 'higher_better') sign = '+';
  if (/lower/i.test(text)) sign = '−';
  if (/higher/i.test(text)) sign = '+';
  if (/^[+\-−]/.test(raw)) sign = raw[0] === '+' ? '+' : '−';
  if (/^[-−]/.test(text)) sign = '−';
  if (/^[+]/.test(text)) sign = '+';
  return `${sign}${unsigned}${unitSuffix}`;
}

function formatImprovementLabel(result) {
  const percent = percentHeadlineParts(result);
  if (percent) {
    const vs = percent.context ? ` ${percent.context}` : '';
    return percent.label ? percent.label + vs : vs.trim();
  }
  const metric = String(result.result_metric || '').trim();
  const blob = `${result.improvement_display_text || ''} ${result.improvement_display_unit || ''}`.toLowerCase();
  let vs = '';
  if (/comparator/.test(blob)) vs = ' vs comparator';
  else if (/vs control/.test(blob) || /\bcontrol\b/.test(blob)) vs = ' vs control';
  return metric ? metric + vs : vs.trim();
}

function fieldContextLabel(trial) {
  return `${fieldEscape(trial.display_product)} | ${fieldEscape(trial.country)}${trial.year ? ` | ${fieldEscape(trial.year)}` : ''}`;
}

function fieldHighlight(trial) {
  const primary = primaryFrontResult(trial);
  const value = primary ? formatImprovementKpi(primary) : '';
  const label = primary ? formatImprovementLabel(primary) : '';
  if (!value) return '';

  return `<div class="fe-highlight">
    <div class="fe-highlight-result">
      <b>${fieldEscape(value)}</b>
      <span>${fieldEscape(label)}</span>
    </div>
    <div class="fe-overline">Field Trial</div>
  </div>`;
}

function renderFieldExperienceHTML(productObj, context, selectedCountry) {
  const matches = getFieldExperienceMatches(productObj.id, context, selectedCountry);
  if (!matches.length) return '';
  return `<section class="field-experience">
    ${fieldHighlight(matches[0])}
    <details class="fe-collapse">
      <summary>
        <span>${fieldContextLabel(matches[0])}</span>
        <span class="fe-count">${matches.length} trial${matches.length > 1 ? 's' : ''}</span>
      </summary>
      <div class="fe-collapse-body">
        ${matches.map(trial => renderFieldTrial(trial)).join('')}
      </div>
    </details>
  </section>`;
}
