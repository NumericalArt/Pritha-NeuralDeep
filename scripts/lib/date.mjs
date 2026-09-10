export function today(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function now(date = new Date()) {
  return date.toISOString();
}
