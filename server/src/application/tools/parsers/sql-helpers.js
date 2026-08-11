export function safeIdentifier(value, fallback) {
  const clean = String(value || '').replace(/[^a-zA-Z0-9_$]/g, '');
  return clean || fallback;
}
