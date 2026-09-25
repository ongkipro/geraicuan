export type SearchValue = string | string[] | undefined;

export function firstValue(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}
