const idrFormatter = new Intl.NumberFormat("id-ID", {
  currency: "IDR",
  maximumFractionDigits: 0,
  style: "currency",
});

const weightFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 3,
});

const wibDateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

export function formatIdr(value: number) {
  return idrFormatter.format(value);
}

export function formatWibDateTime(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${wibDateTimeFormatter.format(date)} WIB`;
}

export function formatWeight(weightGrams: number) {
  return `${weightFormatter.format(weightGrams / 1_000)} kg`;
}

export function formatDimensions(
  lengthCm: number | null,
  widthCm: number | null,
  heightCm: number | null,
) {
  if (lengthCm === null || widthCm === null || heightCm === null) return null;
  return `${lengthCm} × ${widthCm} × ${heightCm} cm`;
}

export type RecipientDensity = {
  tier: "compact" | "long" | "dense" | "ultra";
  omitAreaLine: boolean;
  overCapacity: boolean;
};

export function recipientDensity(input: {
  nameLength: number;
  addressLength: number;
  areaLabelLength: number;
}): RecipientDensity {
  const combined = input.nameLength + input.addressLength + input.areaLabelLength;
  const overCapacity = input.addressLength > 484;

  if (combined <= 200) {
    return { omitAreaLine: false, overCapacity, tier: "compact" };
  }
  if (combined <= 300) {
    return { omitAreaLine: false, overCapacity, tier: "long" };
  }
  if (combined <= 380) {
    return { omitAreaLine: false, overCapacity, tier: "dense" };
  }
  return {
    omitAreaLine: combined > 480,
    overCapacity,
    tier: "ultra",
  };
}
