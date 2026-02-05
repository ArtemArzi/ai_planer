export function toDTO<T extends Record<string, unknown>>(dbRow: T): T {
  return Object.fromEntries(
    Object.entries(dbRow).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
      value
    ])
  ) as T;
}

export function toRow<T extends Record<string, unknown>>(dto: T): T {
  return Object.fromEntries(
    Object.entries(dto).map(([key, value]) => [
      key.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase()),
      value
    ])
  ) as T;
}

export function generateId(): string {
  const timestamp = Date.now();
  const timestampHex = timestamp.toString(16).padStart(12, '0');
  const randomPart = crypto.randomUUID().slice(14);
  return `${timestampHex.slice(0, 8)}-${timestampHex.slice(8)}-7${randomPart}`;
}

export function toBool(value: number | null | undefined): boolean {
  return value === 1;
}

export function fromBool(value: boolean): number {
  return value ? 1 : 0;
}
