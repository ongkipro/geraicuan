// T-245: a small verbatim subset of the vendored Kemendagri wilayah data (data/wilayah/, pinned
// commits in SOURCE.json), enough to exercise ranking and disambiguation without the full import:
// Coblong/Kota Bandung with every kelurahan, Kab. vs Kota Bekasi, "Karanganyar" in two regencies,
// Kab. vs Kota Sorong (both have a kecamatan "Sorong"), Kota Palangkaraya (a Mengantar spelling
// alias), and one village deliberately left without a kode pos.
export const WILAYAH_FIXTURE_VERSION = "fixture-t245";

export const WILAYAH_FIXTURE_NAMES: ReadonlyArray<readonly [string, string]> = [
  ["32", "Jawa Barat"],
  ["32.16", "Kabupaten Bekasi"],
  ["32.16.01", "Tarumajaya"],
  ["32.16.01.1007", "Setia Asih"],
  ["32.16.01.2001", "Sagara Makmur"],
  ["32.73", "Kota Bandung"],
  ["32.73.02", "Coblong"],
  ["32.73.02.1001", "Cipaganti"],
  ["32.73.02.1002", "Lebak Gede"],
  ["32.73.02.1003", "Sadang Serang"],
  ["32.73.02.1004", "Dago"],
  ["32.73.02.1005", "Sekeloa"],
  ["32.73.02.1006", "Lebak Siliwangi"],
  ["32.75", "Kota Bekasi"],
  ["32.75.01", "Bekasi Timur"],
  ["32.75.02", "Bekasi Barat"],
  ["33", "Jawa Tengah"],
  ["33.05", "Kabupaten Kebumen"],
  ["33.05.20", "Karanganyar"],
  ["33.05.20.1003", "Karanganyar"],
  ["33.13", "Kabupaten Karanganyar"],
  ["33.13.09", "Karanganyar"],
  ["33.13.09.1001", "Lalung"],
  ["62", "Kalimantan Tengah"],
  ["62.71", "Kota Palangkaraya"],
  ["62.71.01", "Pahandut"],
  ["62.71.01.1001", "Pahandut"],
  ["62.71.01.1002", "Panarung"],
  ["96", "Papua Barat Daya"],
  ["96.01", "Kabupaten Sorong"],
  ["96.01.18", "Sorong"],
  ["96.01.18.2001", "Maibo"],
  ["96.71", "Kota Sorong"],
  ["96.71.01", "Sorong"],
  ["96.71.01.1004", "Remu"],
];

/** Lebak Siliwangi (32.73.02.1006) is left out on purpose: a village without an upstream kode pos. */
export const WILAYAH_FIXTURE_POSTAL: ReadonlyArray<readonly [string, string]> = [
  ["32.16.01.1007", "17215"],
  ["32.16.01.2001", "17211"],
  ["32.73.02.1001", "40131"],
  ["32.73.02.1002", "40132"],
  ["32.73.02.1003", "40133"],
  ["32.73.02.1004", "40135"],
  ["32.73.02.1005", "40134"],
  ["33.05.20.1003", "54364"],
  ["33.13.09.1001", "57716"],
  ["62.71.01.1001", "73111"],
  ["62.71.01.1002", "73111"],
  ["96.01.18.2001", "98446"],
  ["96.71.01.1004", "98414"],
];
