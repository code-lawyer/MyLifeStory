export function entryId(entry) {
  return typeof entry === 'string' ? entry : entry.id;
}

export function entryRole(entry) {
  return typeof entry === 'object' ? (entry.role || '') : '';
}
