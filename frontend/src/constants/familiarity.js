export const FAMILIARITY_LEVELS = [
  { min: 81, label: '心腹' },
  { min: 61, label: '挚友' },
  { min: 41, label: '熟人' },
  { min: 21, label: '相识' },
  { min: 0,  label: '陌生人' },
];

export function getFamiliarityLabel(fam) {
  return FAMILIARITY_LEVELS.find(l => fam >= l.min)?.label || '陌生人';
}

export const DARK_TEASER_THRESHOLD = 61;
