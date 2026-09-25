// Local demo seed (T-189). Writes one coherent Indonesian store — Sekar Batik
// Nusantara — plus the self-service registrations the Super Admin approval queue
// reviews, without calling Mengantar or sending mail.
//
//   pnpm db:seed-local              replace the seed-owned rows, keep everything else
//   pnpm db:seed-local -- --reset   also delete every tenant and user the seed does not own
//
// Local-only: the target must be 127.0.0.1 and `geraicuan_test` (the developer
// database) or a disposable `geraicuan_<name>_seed` database, with no query
// parameters (scripts/local-database-target.mjs).
//
// Money never comes from typed numbers: COD amounts use the constants and
// helpers in src/lib/mengantar-cod-fee.ts (the same ones src/db/cod-totals-repository.ts
// builds on), ledger entries follow appendLedgerForIssuedProviderOrder /
// appendLedgerForCompletedUnpaidRecovery, and every row still has to satisfy the
// database CHECKs, which encode each COD formula version exactly.
import { createHash, randomBytes, randomUUID, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { Client } from "pg";

import {
  BASIS_POINTS,
  MENGANTAR_COD_FEE_BASIS_POINTS,
  codOngkirBreakEvenIdr,
  mengantarCodFeeIdr,
  shippingMengantarDeductsIdr,
} from "../src/lib/mengantar-cod-fee.ts";
import { mengantarCourierOfService } from "../src/lib/mengantar-couriers.ts";
import { paymentMethodOf } from "../src/lib/payment-method.ts";
import { resolveLocalSeedTarget } from "./local-database-target.mjs";

const scryptAsync = promisify(scrypt);
const hashPassword = async (password) => {
  const salt = randomBytes(16).toString("hex");
  const key = await scryptAsync(password.normalize("NFKC"), salt, 64, {
    N: 16384,
    r: 16,
    p: 1,
    maxmem: 128 * 16384 * 16 * 2,
  });
  return `${salt}:${key.toString("hex")}`;
};

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const unknownArgs = args.filter((arg) => arg !== "--reset");
if (unknownArgs.length > 0) {
  throw new Error(`Unknown argument(s): ${unknownArgs.join(" ")}. The only flag is --reset.`);
}
const reset = args.includes("--reset");

const databaseUrl = process.env.DATABASE_URL;
const password = process.env.DEV_LOCAL_PASSWORD;

if (!databaseUrl || !password) {
  throw new Error("DATABASE_URL and DEV_LOCAL_PASSWORD are required.");
}

// T-198: parsed with pg's own parser and connected by these fields only
// (scripts/local-database-target.mjs), so a query parameter cannot redirect it.
const target = resolveLocalSeedTarget(databaseUrl);

// ---------------------------------------------------------------------------
// Fixed identities. Audits and README depend on these three logins and on the
// tenant id; the other prefixes keep the ids earlier seeds used, so a plain
// re-seed replaces those rows in place.
// ---------------------------------------------------------------------------
const accounts = [
  { email: "tenant@geraicuan.com", name: "Wulan Sekarsari", role: "TENANT_ADMIN" },
  { email: "operator@geraicuan.com", name: "Dimas Saputra", role: "OPERATOR" },
  { email: "super@geraicuan.com", name: "Local Super Admin", role: "SUPER_ADMIN" },
];
const tenantId = "70000000-0000-4000-8000-000000000001";
const outletId = "70000000-0000-4000-8000-000000000002";
const TENANT_NAME = "Sekar Batik Nusantara";
const TENANT_WHATSAPP = "081290000100";
const OUTLET_NAME = "Gudang Jakarta Barat";
const issuer = "local:credential";

const fixedUuid = (prefix, index) =>
  `${prefix}000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
/** Mengantar identifiers are 24-hex document ids; derive stable synthetic ones. */
const providerId = (seed) => sha256(`geraicuan-demo:${seed}`).slice(0, 24);
const PROVIDER_ACCOUNT_KEY = sha256("local-demo-provider-account");

const jakartaDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
// Midnight today in Asia/Jakarta. Every timestamp is relative to it, so a
// re-seed on the same Jakarta day writes identical rows.
const anchor = new Date(`${jakartaDate}T00:00:00+07:00`);
const HOUR = 3_600_000;
const DAY = 86_400_000;
const at = (daysAgo, hour = 9, minute = 0) =>
  new Date(anchor.getTime() - daysAgo * DAY + hour * HOUR + minute * 60_000);
const plus = (date, milliseconds) => new Date(date.getTime() + milliseconds);

// ---------------------------------------------------------------------------
// Places. Labels follow src/lib/mengantar-locations.ts: a destination area is
// "Subdistrict, District, City, Province, ZIP"; a pickup point is the provider
// pickup name and address with its area, and its origin is "District, City, Province".
// ---------------------------------------------------------------------------
const AREAS = {
  kebonJeruk: ["Kebon Jeruk", "Kebon Jeruk", "Kota Jakarta Barat", "DKI Jakarta", "11530", "JABODETABEK"],
  kuninganTimur: ["Kuningan Timur", "Setiabudi", "Kota Jakarta Selatan", "DKI Jakarta", "12950", "JABODETABEK"],
  tebetBarat: ["Tebet Barat", "Tebet", "Kota Jakarta Selatan", "DKI Jakarta", "12810", "JABODETABEK"],
  kelapaGading: ["Kelapa Gading Timur", "Kelapa Gading", "Kota Jakarta Utara", "DKI Jakarta", "14240", "JABODETABEK"],
  cempakaPutih: ["Cempaka Putih Timur", "Cempaka Putih", "Kota Jakarta Pusat", "DKI Jakarta", "10510", "JABODETABEK"],
  kampungBali: ["Kampung Bali", "Tanah Abang", "Kota Jakarta Pusat", "DKI Jakarta", "10250", "JABODETABEK"],
  kemiriMuka: ["Kemiri Muka", "Beji", "Kota Depok", "Jawa Barat", "16423", "JABODETABEK"],
  baranangsiang: ["Baranangsiang", "Bogor Timur", "Kota Bogor", "Jawa Barat", "16143", "JABODETABEK"],
  pondokAren: ["Pondok Aren", "Pondok Aren", "Kota Tangerang Selatan", "Banten", "15224", "JABODETABEK"],
  karawaci: ["Karawaci", "Karawaci", "Kota Tangerang", "Banten", "15115", "JABODETABEK"],
  margahayu: ["Margahayu", "Bekasi Timur", "Kota Bekasi", "Jawa Barat", "17113", "JABODETABEK"],
  cigadung: ["Cigadung", "Cibeunying Kaler", "Kota Bandung", "Jawa Barat", "40191", "JAWA"],
  gubeng: ["Gubeng", "Gubeng", "Kota Surabaya", "Jawa Timur", "60281", "JAWA"],
  caturtunggal: ["Caturtunggal", "Depok", "Kabupaten Sleman", "DI Yogyakarta", "55281", "JAWA"],
  pleburan: ["Pleburan", "Semarang Selatan", "Kota Semarang", "Jawa Tengah", "50241", "JAWA"],
  lowokwaru: ["Lowokwaru", "Lowokwaru", "Kota Malang", "Jawa Timur", "65141", "JAWA"],
  petisahTengah: ["Petisah Tengah", "Medan Petisah", "Kota Medan", "Sumatera Utara", "20112", "LUAR_JAWA"],
  panakkukang: ["Panaikang", "Panakkukang", "Kota Makassar", "Sulawesi Selatan", "90231", "LUAR_JAWA"],
  dauhPuriKauh: ["Dauh Puri Kauh", "Denpasar Barat", "Kota Denpasar", "Bali", "80113", "LUAR_JAWA"],
  ilirTimur: ["20 Ilir D. I", "Ilir Timur I", "Kota Palembang", "Sumatera Selatan", "30128", "LUAR_JAWA"],
};
const area = (key) => {
  const [subdistrict, district, city, province, zip, zone] = AREAS[key];
  return {
    id: providerId(`area:${key}`),
    label: [subdistrict, district, city, province, zip].join(", "),
    originLabel: [district, city, province].join(", "),
    zone,
  };
};

const pickupPoints = [
  {
    id: fixedUuid("80", 1),
    key: "gudang",
    name: "Gudang Sekar Batik",
    street: "Jl. Panjang No. 18",
    area: "kebonJeruk",
    isDefault: true,
  },
  {
    id: fixedUuid("80", 2),
    key: "tanahabang",
    name: "Kios Tanah Abang",
    street: "Pasar Tanah Abang Blok A Lt. 3 Los C-12",
    area: "kampungBali",
    isDefault: false,
  },
  {
    id: fixedUuid("80", 3),
    key: "bekasi",
    name: "Workshop Jahit Bekasi",
    street: "Jl. Ir. H. Juanda No. 77",
    area: "margahayu",
    isDefault: false,
  },
].map((point) => {
  const place = area(point.area);
  const [subdistrict, district, city, province, zip] = AREAS[point.area];
  return {
    ...point,
    pickupAddressId: providerId(`pickup:${point.key}`),
    pickupAddressLabel: [point.name, point.street, subdistrict, district, city, province, zip].join(", "),
    streetAddress: `${point.street}, ${subdistrict}, ${district}, ${city}`,
    originAreaId: providerId(`origin:${point.key}`),
    originAreaLabel: place.originLabel,
  };
});
const defaultPickup = pickupPoints.find(({ isDefault }) => isDefault);

// ---------------------------------------------------------------------------
// Contacts. Ids 1–3 stay senders (1 and 3 also recipients), 4 stays a
// recipient-only contact and 16 stays an archived recipient, as earlier seeds
// had them. Phones use one synthetic 0812-9000-xxxx block so no demo number can
// belong to a real person.
// ---------------------------------------------------------------------------
const contactDefinitions = [
  [1, "Putri Wulandari", { sender: true, recipient: true }, [["Rumah", "Jl. Tebet Barat Dalam X No. 12", "tebetBarat"]]],
  [2, "Rahmat Hidayat", { sender: true, recipient: false }, [["Gudang", "Jl. Panjang No. 18", "kebonJeruk"]]],
  [3, "Ade Novita", { sender: true, recipient: true }, [["Rumah", "Perum Bumi Bekasi Baru Blok C2 No. 5", "margahayu"]]],
  [4, "Siti Rahmawati", { sender: false, recipient: true }, [
    ["Rumah", "Jl. Karet Pedurenan No. 41 RT 05/RW 02", "kuninganTimur"],
    ["Kantor", "Menara Kuningan Lt. 12, Jl. H.R. Rasuna Said Kav. 5", "kuninganTimur"],
  ]],
  [5, "Bambang Susilo", { sender: false, recipient: true }, [["Rumah", "Jl. Boulevard Raya Blok QJ 3 No. 8", "kelapaGading"]]],
  [6, "Nur Aisyah", { sender: false, recipient: true }, [["Kos", "Jl. Margonda Raya Gg. Kober No. 21", "kemiriMuka"]]],
  [7, "Agus Prasetyo", { sender: false, recipient: true }, [["Rumah", "Jl. Pajajaran No. 88", "baranangsiang"]]],
  [8, "Linda Kusumawati", { sender: false, recipient: true }, [
    ["Rumah", "Bintaro Jaya Sektor 3A, Jl. Elang Laut No. 9", "pondokAren"],
    ["Kantor", "Ruko Kebayoran Arcade 2 Blok B1 No. 17", "pondokAren"],
  ]],
  [9, "Fajar Nugroho", { sender: false, recipient: true }, [["Rumah", "Perumahan Lippo Karawaci, Jl. Taman Permata No. 30", "karawaci"]]],
  [10, "Rina Marlina", { sender: false, recipient: true }, [["Rumah", "Jl. Cigadung Raya Timur No. 102", "cigadung"]]],
  [11, "Yoga Pratama", { sender: false, recipient: true }, [["Rumah", "Jl. Kertajaya Indah Timur IV No. 15", "gubeng"]]],
  [12, "Wahyu Hidayat", { sender: false, recipient: true }, [["Kos", "Jl. Seturan Raya Gg. Kenari No. 7", "caturtunggal"]]],
  [13, "Maria Christina", { sender: false, recipient: true }, [["Rumah", "Jl. Pandanaran II No. 26", "pleburan"]]],
  [14, "Rudi Hartono Sitorus", { sender: false, recipient: true }, [["Rumah", "Jl. Gatot Subroto No. 145", "petisahTengah"]]],
  [15, "Andi Makkasau", { sender: false, recipient: true }, [["Rumah", "Jl. Pengayoman Blok F5 No. 12", "panakkukang"]]],
  [16, "Sari Handayani", { sender: false, recipient: true, archivedDaysAgo: 12 }, [["Rumah lama", "Jl. Cempaka Putih Tengah XX No. 3", "cempakaPutih"]]],
  [17, "I Made Suardana", { sender: false, recipient: true }, [["Rumah", "Jl. Gunung Agung Gg. Merpati No. 4", "dauhPuriKauh"]]],
  [18, "Dian Permatasari", { sender: false, recipient: true }, [["Rumah", "Jl. Soekarno Hatta No. 9", "lowokwaru"]]],
  [19, "Hendra Gunawan", { sender: false, recipient: true }, [["Toko", "Jl. Kolonel Atmo No. 311", "ilirTimur"]]],
  [20, "Toko Kain Haji Umar", { sender: true, recipient: false }, [["Kios", "Pasar Tanah Abang Blok B Lt. 1 Los A-7", "kampungBali"]]],
  [21, "Yusuf Maulana", { sender: true, recipient: false, archivedDaysAgo: 20 }, [["Rumah", "Jl. Nusantara Raya No. 55", "kemiriMuka"]]],
  [22, "Kevin Wijaya", { sender: true, recipient: true }, [["Rumah", "Jl. Dharmahusada Indah Utara No. 60", "gubeng"]]],
  [23, "Joko Susanto", { sender: false, recipient: true, archivedDaysAgo: 5 }, [["Rumah", "Jl. Imam Bonjol No. 38", "karawaci"]]],
];
const contacts = contactDefinitions.map(([index, name, roles, addresses]) => ({
  id: fixedUuid("71", index),
  index,
  name,
  phone: `08129000${String(index).padStart(4, "0")}`,
  isSender: roles.sender,
  isRecipient: roles.recipient,
  createdAt: at(62 - index, 10, index),
  archivedAt: roles.archivedDaysAgo === undefined ? null : at(roles.archivedDaysAgo, 16),
  addresses: addresses.map(([label, street, areaKey], addressIndex) => ({
    id: fixedUuid("7f", index * 10 + addressIndex),
    label,
    street,
    area: area(areaKey),
    isPrimary: addressIndex === 0,
  })),
}));
const contactById = new Map(contacts.map((contact) => [contact.index, contact]));

// ---------------------------------------------------------------------------
// Catalogue and couriers. Service keys are the ones Mengantar quotes
// (tests/fixtures/mengantar-couriers.catalogue.json); COD eligibility follows
// that capture's codSupportedOn (JNE, SiCepat and Ninja quote no COD).
// ---------------------------------------------------------------------------
const products = [
  { content: "Kemeja batik pria lengan panjang", grams: 350, dims: [30, 25, 5], value: 285_000 },
  { content: "Kain batik tulis Pekalongan 2 m", grams: 400, dims: [30, 20, 5], value: 450_000 },
  { content: "Daster batik rayon", grams: 250, dims: [30, 25, 6], value: 85_000 },
  { content: "Tas anyaman pandan", grams: 700, dims: [35, 30, 15], value: 210_000 },
  { content: "Hijab voal motif parang", grams: 150, dims: [25, 20, 3], value: 89_000 },
  { content: "Sarung tenun Samarinda", grams: 450, dims: [30, 25, 6], value: 325_000 },
  { content: "Blouse batik wanita", grams: 300, dims: [30, 25, 4], value: 199_000 },
  { content: "Set taplak meja batik", grams: 900, dims: [40, 30, 8], value: 245_000 },
  { content: "Outer kimono batik", grams: 400, dims: [30, 25, 6], value: 235_000 },
];
const services = {
  JNE: { factor: 100, discount: 30, eta: "2-3 hari", cod: false },
  SiCepat: { factor: 95, discount: 30, eta: "1-2 hari", cod: false },
  Ninja: { factor: 100, discount: 25, eta: "2-4 hari", cod: false },
  JT: { factor: 100, discount: 25, eta: "2-3 hari", cod: true },
  spx: { factor: 90, discount: 20, eta: "2-4 hari", cod: true },
  SAP: { factor: 95, discount: 25, eta: "2-3 hari", cod: true },
  anteraja: { factor: 95, discount: 25, eta: "2-3 hari", cod: true },
  iDexpress: { factor: 90, discount: 30, eta: "3-5 hari", cod: true },
  lion: { factor: 92, discount: 20, eta: "3-5 hari", cod: true },
  pos: { factor: 105, discount: 10, eta: "3-6 hari", cod: true },
};
const NON_COD_SERVICES = ["JNE", "SiCepat", "JT", "JNE", "spx", "SiCepat", "Ninja", "anteraja"];
const COD_SERVICES = ["JT", "spx", "SAP", "anteraja", "iDexpress", "lion", "pos"];
const PER_KG_IDR = { JABODETABEK: 10_000, JAWA: 18_000, LUAR_JAWA: 34_000 };

/** A Mengantar-shaped quote: `price`, `estimatedPrice` and a discounted `estimatedSpecialPrice`. */
const quote = (serviceKey, place, grams) => {
  const service = services[serviceKey];
  const kilograms = Math.max(1, Math.ceil(grams / 1000));
  const price = Math.round((PER_KG_IDR[place.zone] * kilograms * service.factor) / 100 / 500) * 500;
  const discountIdr = Math.floor((price * service.discount) / 100);
  return {
    providerService: serviceKey,
    shippingAmountIdr: price,
    normalPriceIdr: price,
    specialPriceIdr: price - discountIdr,
    discountIdr,
    codFeeIdr: 0,
    deliveryEstimate: service.eta,
    codEligible: service.cod,
  };
};

// COD formula version 2 — the rule `calculateCodAmounts` implements and
// shipment_cod_totals_provider_cod_amount_gross_up_v2 / _service_fee_split_v2 check.
const codAmountsV2 = (goodsValueIdr, shippingAmountIdr) => {
  const net = BigInt(BASIS_POINTS - MENGANTAR_COD_FEE_BASIS_POINTS);
  const base = BigInt(goodsValueIdr + shippingAmountIdr);
  const providerCod = (base * BigInt(BASIS_POINTS) + net - BigInt(1)) / net;
  const markup = providerCod - base;
  const serviceFee = (markup * BigInt(100) + BigInt(55)) / BigInt(111);
  return {
    codFormulaVersion: 2,
    codShippingBasisIdr: null,
    serviceFeeIdr: Number(serviceFee),
    vatAmountIdr: Number(markup - serviceFee),
    providerCodAmountIdr: Number(providerCod),
  };
};
// COD formula version 3 (COD Ongkir) — `calculateCodOngkirAmounts`: the charge is
// at least codOngkirBreakEvenIdr of the shipping Mengantar deducts.
const codAmountsV3 = (selected, markupIdr) => {
  const basis = shippingMengantarDeductsIdr(selected);
  const breakEven = codOngkirBreakEvenIdr(basis);
  if (breakEven === null) throw new Error("COD Ongkir break-even is unavailable.");
  const charge = Math.ceil(breakEven / 1000) * 1000 + markupIdr;
  const feeTotal = BigInt(mengantarCodFeeIdr(charge));
  const serviceFee = (feeTotal * BigInt(100) + BigInt(55)) / BigInt(111);
  return {
    codFormulaVersion: 3,
    codShippingBasisIdr: basis,
    serviceFeeIdr: Number(serviceFee),
    vatAmountIdr: Number(feeTotal - serviceFee),
    providerCodAmountIdr: charge,
  };
};

const AWB_FORMATS = {
  JNE: (n) => `CGK0${String(1_300_000_000 + n * 7_919)}`,
  SiCepat: (n) => `0046${String(10_000_000 + n * 3_571)}`,
  Ninja: (n) => `NLIDAP${String(100_000_000 + n * 4_391)}`,
  JT: (n) => `JX${String(3_100_000_000 + n * 6_133)}`,
  spx: (n) => `SPXID0${String(48_000_000_000 + n * 9_137)}`,
  SAP: (n) => `SAP${String(800_000_000 + n * 2_741)}`,
  anteraja: (n) => `10${String(9_000_000_000 + n * 5_527)}`,
  iDexpress: (n) => `IDE${String(700_000_000 + n * 8_663)}`,
  lion: (n) => `11LP${String(1_700_000_000 + n * 3_907)}`,
  pos: (n) => `P${String(2_600_000_000 + n * 4_421)}`,
};

// ---------------------------------------------------------------------------
// Shipment plan: [lifecycle, payment method, days ago, flags]. Written in
// authoring order (ids 72…001 onward); numbers are allocated in creation order.
// Settlement pulls run on PULL_DAYS; a delivery outcome is observed on the
// first pull at least three days after issuance, as Mengantar reports it.
// ---------------------------------------------------------------------------
const PULL_DAYS = [50, 40, 30, 20, 12, 6, 2];
const plan = [
  ["DELIVERED", "COD", 58], ["DELIVERED", "NON_COD", 55], ["DELIVERED", "COD", 52],
  ["DELIVERED", "COD_ONGKIR", 50], ["DELIVERED", "COD", 47], ["DELIVERED", "NON_COD", 45],
  ["DELIVERED", "COD", 43], ["DELIVERED", "COD", 40], ["DELIVERED", "NON_COD", 38],
  ["DELIVERED", "COD_ONGKIR", 36], ["DELIVERED", "COD", 34],
  // 72…012 and 72…014 stay the shipment detail and printable label the page sweep opens.
  ["SUBMISSION_UNKNOWN", "COD", 0],
  ["ISSUED", "COD", 2, { printed: true }],
  ["ISSUED", "NON_COD", 3, { printed: true }],
  ["DELIVERED", "NON_COD", 31], ["DELIVERED", "COD", 29], ["DELIVERED", "COD", 27],
  ["DELIVERED", "COD_ONGKIR", 25], ["DELIVERED", "NON_COD", 23], ["DELIVERED", "COD", 21],
  ["DELIVERED", "COD", 19], ["DELIVERED", "NON_COD", 17], ["DELIVERED", "COD", 15],
  ["DELIVERED", "COD_ONGKIR", 14], ["DELIVERED", "COD", 12], ["DELIVERED", "NON_COD", 11],
  ["DELIVERED", "COD", 10], ["DELIVERED", "NON_COD", 9], ["DELIVERED", "COD_ONGKIR", 8],
  ["DELIVERED", "COD", 7], ["DELIVERED", "NON_COD", 6],
  ["PROBLEM", "COD", 16, { lost: true }], ["PROBLEM", "COD_ONGKIR", 9],
  ["RTS_QUEUED", "COD", 8], ["RTS_QUEUED", "COD_ONGKIR", 7], ["RTS_QUEUED", "NON_COD", 13],
  ["RTS_IN_TRANSIT", "COD", 18], ["RTS_IN_TRANSIT", "COD", 11],
  ["RTS_RECEIVED", "COD", 26], ["RTS_RECEIVED", "NON_COD", 22],
  ["ISSUED", "COD", 4, { printed: true }], ["ISSUED", "COD_ONGKIR", 3, { printed: true }],
  ["ISSUED", "NON_COD", 1, { printed: true }],
  ["ISSUED", "NON_COD", 5, { printed: true, recovered: true }],
  ["ISSUED", "COD", 1], ["ISSUED", "NON_COD", 0], ["ISSUED", "COD", 0], ["ISSUED", "COD_ONGKIR", 0],
  ["AWAITING_UPSTREAM_PAYMENT", "NON_COD", 1],
  ["FAILED", "COD", 24], ["FAILED", "NON_COD", 2],
  ["SUBMISSION_QUEUED", "NON_COD", 0],
  ["ESTIMATED", "COD", 0], ["ESTIMATED", "COD_ONGKIR", 1], ["ESTIMATED", "NON_COD", 0], ["ESTIMATED", "NON_COD", 2],
  ["DRAFT", "NON_COD", 0], ["DRAFT", "COD", 0], ["DRAFT", "COD_ONGKIR", 1], ["DRAFT", "NON_COD", 3],
];

const ISSUED_AT_SOME_POINT = new Set(["ISSUED", "DELIVERED", "PROBLEM", "RTS_QUEUED", "RTS_IN_TRANSIT", "RTS_RECEIVED"]);
const SENDER_ROTATION = [2, 2, 1, 2, 3, 20, 2, 22];
const RECIPIENT_ROTATION = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18, 19, 1, 3, 22];
const ARCHIVED_RECIPIENTS = [16, 23];
const INSTRUCTIONS = [null, "Mohon telepon penerima sebelum diantar.", null, "Titip ke satpam jika penerima tidak di tempat.", null, null];
const LANDMARKS = [null, "Dekat masjid Al-Ikhlas", null, null, "Seberang minimarket", null, "Pagar hitam, rumah pojok"];

const shipmentDefinitions = plan.map(([status, paymentMethod, daysAgo, flags = {}], index) => {
  const n = index + 1;
  const isCod = paymentMethod !== "NON_COD";
  const codShippingOnly = paymentMethod === "COD_ONGKIR";
  if (paymentMethodOf(isCod, codShippingOnly) !== paymentMethod) throw new Error("Payment method mapping drifted.");
  const hour = daysAgo === 0 ? 7 + (index % 3) : 8 + ((index * 5) % 11);
  const createdAt = at(daysAgo, hour, (index * 13) % 60);
  const creator = index % 3 === 1 ? "OPERATOR" : "TENANT_ADMIN";
  const product = products[index % products.length];
  const quantity = 1 + (index % 4 === 0 ? 1 : 0);
  const sender = contactById.get(SENDER_ROTATION[index % SENDER_ROTATION.length]);
  const recipientIndex = daysAgo >= 30 && index % 4 === 1
    ? ARCHIVED_RECIPIENTS[index % 2]
    : RECIPIENT_ROTATION[index % RECIPIENT_ROTATION.length];
  const recipient = contactById.get(recipientIndex === sender.index ? 4 : recipientIndex);
  const recipientAddress = recipient.addresses[index % recipient.addresses.length];
  const pickup = pickupPoints[index % 7 === 3 ? 1 : index % 7 === 5 ? 2 : 0];
  const grams = product.grams * quantity;
  const goodsValueIdr = product.value * quantity;
  const pool = isCod ? COD_SERVICES : NON_COD_SERVICES;
  const serviceKeys = [0, 1, 2].map((offset) => pool[(index + offset * 3) % pool.length]);
  const quotes = [...new Set(serviceKeys)].map((key) => quote(key, recipientAddress.area, grams));
  const selected = quotes[0];
  const courier = mengantarCourierOfService(selected.providerService);
  if (!courier) throw new Error(`No courier claims ${selected.providerService}.`);
  const estimated = status !== "DRAFT";
  const cod = !estimated || !isCod
    ? null
    : codShippingOnly
      // A COD Ongkir total is written when the operator confirms the charge,
      // so an estimate-only COD Ongkir draft has none yet.
      ? status === "ESTIMATED" ? null : codAmountsV3(selected, index % 2 === 0 ? 2_000 : 0)
      : codAmountsV2(goodsValueIdr, selected.shippingAmountIdr);
  const issued = ISSUED_AT_SOME_POINT.has(status);
  const estimateAt = plus(createdAt, 20 * 60_000);
  const submittedAt = plus(createdAt, 45 * 60_000);
  const resolvedAt = plus(createdAt, 50 * 60_000);
  const recoveryCompletedAt = flags.recovered ? plus(createdAt, 20 * HOUR) : null;
  const issuedAt = recoveryCompletedAt ?? resolvedAt;
  const pullDay = issued && status !== "ISSUED"
    ? PULL_DAYS.find((day) => day <= daysAgo - 3)
    : null;
  if (issued && status !== "ISSUED" && pullDay === undefined) {
    throw new Error(`Shipment ${n} has no settlement pull after its issuance.`);
  }
  return {
    n,
    index,
    status,
    paymentMethod,
    isCod,
    codShippingOnly,
    daysAgo,
    flags,
    id: fixedUuid("72", n),
    estimateSnapshotId: fixedUuid("73", n),
    codTotalId: fixedUuid("75", n),
    batchId: fixedUuid("76", n),
    providerOrderSnapshotId: fixedUuid("77", n),
    recoveryId: fixedUuid("81", n),
    createdAt,
    estimateAt,
    submittedAt,
    resolvedAt,
    recoveryCompletedAt,
    issuedAt,
    printedAt: flags.printed || (issued && status !== "ISSUED") ? plus(issuedAt, 90 * 60_000) : null,
    creator,
    product,
    quantity,
    grams,
    goodsValueIdr,
    // Every third shipment records the merchant's cost of goods for margin KPIs.
    cogsAmountIdr: index % 3 === 0 ? null : Math.round((goodsValueIdr * 0.55) / 1000) * 1000,
    sender,
    recipient,
    recipientAddress,
    pickup,
    quotes,
    selected,
    courier,
    cod,
    issued,
    awb: issued ? AWB_FORMATS[courier](n) : null,
    providerOrderId: providerId(`order:${n}`),
    pullDay,
    shippingInstruction: INSTRUCTIONS[index % INSTRUCTIONS.length],
    landmark: LANDMARKS[index % LANDMARKS.length],
  };
});
// Numbers follow creation order, so GC-10000 is the oldest shipment.
const creationOrder = [...shipmentDefinitions].sort(
  (left, right) => left.createdAt - right.createdAt || left.n - right.n,
);
const shipmentIds = shipmentDefinitions.map(({ id }) => id);

const settlementPulls = PULL_DAYS.map((day, index) => ({
  id: fixedUuid("82", index + 1),
  day,
  createdAt: at(day, 10),
  periodStart: at(index === 0 ? 62 : PULL_DAYS[index - 1], 10),
  periodEnd: at(day, 10),
}));
const pullForDay = new Map(settlementPulls.map((pull) => [pull.day, pull]));

// Self-service registrations for the approval queue (/platform/pendaftaran),
// written through register_tenant_self_service exactly as the sign-up form does.
const registrations = [
  {
    storeName: "Kopi Senja Nusantara",
    ownerName: "Rina Kartikasari",
    email: "rina.kopisenja@example.com",
    whatsapp: "081290000201",
    registeredDaysAgo: 1,
    emailVerified: true,
  },
  {
    storeName: "Dapur Sambal Bu Tini",
    ownerName: "Hartini Wibowo",
    email: "hartini.sambal@example.com",
    whatsapp: "081290000202",
    registeredDaysAgo: 0,
    emailVerified: false,
  },
  {
    storeName: "Grosir Aksesoris HP 99",
    ownerName: "Andi Saputra",
    email: "andi.grosir99@example.com",
    whatsapp: "081290000203",
    registeredDaysAgo: 6,
    emailVerified: true,
    rejection: "Nama toko dan nomor WhatsApp tidak dapat diverifikasi. Silakan daftar ulang dengan data usaha yang valid.",
  },
];

const TENANT_SCOPED_TABLES = [
  "memberships", "outlets", "outlet_pickup_points", "contacts", "contact_addresses", "shipments",
  "shipment_drafts", "shipment_parties", "shipment_estimate_snapshots", "shipment_estimate_services",
  "shipment_cod_totals", "provider_batches", "provider_order_snapshots", "provider_unpaid_recoveries",
  "print_events", "shipment_rts_events", "provider_settlement_pulls", "provider_settlement_items",
  "provider_order_status_observations", "ledger_entries", "reconciliation_runs", "mengantar_connections",
  "managed_secret_payloads", "shipment_rate_limits", "tenant_shipment_counters", "audit_events",
];

const passwordHash = await hashPassword(password);
const client = new Client({ ...target, application_name: "geraicuan-seed-local" });
const query = (text, values) => client.query(text, values);

async function tenantTableCounts() {
  const { rows: tenants } = await query(
    "SELECT id, name, status FROM tenants ORDER BY (id = $1) DESC, created_at, id",
    [tenantId],
  );
  const result = [];
  for (const tenant of tenants) {
    const counts = {};
    for (const table of TENANT_SCOPED_TABLES) {
      const { rows } = await query(`SELECT count(*)::int AS total FROM ${table} WHERE tenant_id = $1`, [tenant.id]);
      if (rows[0].total > 0) counts[table] = rows[0].total;
    }
    result.push({ tenant: tenant.name, id: tenant.id, status: tenant.status, ...counts });
  }
  const { rows: users } = await query("SELECT count(*)::int AS total FROM users");
  return { users: users[0].total, tenants: result };
}

// The two append-only tables refuse DELETE by trigger. Disabling the trigger is
// transactional, so a failed seed rolls it back enabled.
async function withImmutableTriggersDisabled(work) {
  await query("ALTER TABLE ledger_entries DISABLE TRIGGER ledger_entries_immutable");
  await query("ALTER TABLE reconciliation_runs DISABLE TRIGGER reconciliation_runs_immutable");
  await work();
  await query("ALTER TABLE ledger_entries ENABLE TRIGGER ledger_entries_immutable");
  await query("ALTER TABLE reconciliation_runs ENABLE TRIGGER reconciliation_runs_immutable");
}

/**
 * Deletes operational rows in foreign-key order. `scope.all` removes every
 * operational row of the tenants; otherwise only rows hanging off the given
 * shipment, settlement pull and reconciliation run ids.
 */
async function purgeOperationalRows(tenantIds, scope) {
  const all = scope.all === true;
  const ships = scope.shipmentIds ?? [];
  const pulls = scope.pullIds ?? [];
  const runs = scope.runIds ?? [];
  const byShipment = "tenant_id = ANY($1::uuid[]) AND ($2 OR shipment_id = ANY($3::uuid[]))";
  const shipmentParams = [tenantIds, all, ships];
  const deleteByShipment = (table) => query(`DELETE FROM ${table} WHERE ${byShipment}`, shipmentParams);

  // Reversals before the entries they reverse (self-referencing foreign key).
  await query(`DELETE FROM ledger_entries WHERE reverses_entry_id IS NOT NULL AND ${byShipment}`, shipmentParams);
  await query(
    `DELETE FROM ledger_entries WHERE tenant_id = ANY($1::uuid[])
       AND ($2 OR shipment_id = ANY($3::uuid[]) OR reconciliation_run_id = ANY($4::uuid[]))`,
    [tenantIds, all, ships, runs],
  );
  await query(
    "DELETE FROM reconciliation_runs WHERE tenant_id = ANY($1::uuid[]) AND ($2 OR id = ANY($3::uuid[]))",
    [tenantIds, all, runs],
  );
  await deleteByShipment("print_events");
  for (const table of ["provider_order_status_observations", "provider_settlement_items"]) {
    await query(
      `DELETE FROM ${table} WHERE tenant_id = ANY($1::uuid[])
         AND ($2 OR shipment_id = ANY($3::uuid[]) OR pull_id = ANY($4::uuid[]))`,
      [tenantIds, all, ships, pulls],
    );
  }
  await query(
    "DELETE FROM provider_settlement_pulls WHERE tenant_id = ANY($1::uuid[]) AND ($2 OR id = ANY($3::uuid[]))",
    [tenantIds, all, pulls],
  );
  await query(
    `DELETE FROM provider_unpaid_recoveries WHERE tenant_id = ANY($1::uuid[]) AND ($2 OR provider_order_snapshot_id IN (
       SELECT id FROM provider_order_snapshots WHERE tenant_id = ANY($1::uuid[]) AND shipment_id = ANY($3::uuid[])))`,
    shipmentParams,
  );
  const { rows: batches } = await query(
    `SELECT DISTINCT batch_id FROM provider_order_snapshots WHERE ${byShipment}`,
    shipmentParams,
  );
  await deleteByShipment("provider_order_snapshots");
  await query(
    `DELETE FROM provider_batches batch WHERE batch.tenant_id = ANY($1::uuid[])
       AND ($2 OR batch.id = ANY($3::uuid[]))
       AND NOT EXISTS (SELECT 1 FROM provider_order_snapshots o WHERE o.batch_id = batch.id AND o.tenant_id = batch.tenant_id)`,
    [tenantIds, all, batches.map(({ batch_id }) => batch_id)],
  );
  await deleteByShipment("shipment_cod_totals");
  await query(
    `DELETE FROM shipment_estimate_services WHERE tenant_id = ANY($1::uuid[]) AND snapshot_id IN (
       SELECT id FROM shipment_estimate_snapshots WHERE ${byShipment})`,
    shipmentParams,
  );
  for (const table of ["shipment_estimate_snapshots", "shipment_rts_events", "shipment_parties", "shipment_drafts"]) {
    await deleteByShipment(table);
  }
  await query(
    "DELETE FROM shipments WHERE tenant_id = ANY($1::uuid[]) AND ($2 OR id = ANY($3::uuid[]))",
    shipmentParams,
  );
}

await client.connect();
let seedSummary;
let before = null;
try {
  await query(
    "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'geraicuan_test_runtime') THEN CREATE ROLE geraicuan_test_runtime LOGIN INHERIT IN ROLE geraicuan_app; END IF; END $$",
  );
  const runtimePasswordStatement = await query(
    "SELECT format('ALTER ROLE geraicuan_test_runtime PASSWORD %L', $1::text) AS statement",
    [password],
  );
  await query(runtimePasswordStatement.rows[0].statement);
  await query("BEGIN");
  if (reset) before = await tenantTableCounts();

  const { rows: previousCounter } = await query(
    // As text: a JavaScript Date would drop the microseconds on the way back.
    "SELECT shipment_prefix_locked_at::text AS shipment_prefix_locked_at FROM tenant_shipment_counters WHERE tenant_id = $1",
    [tenantId],
  );

  await withImmutableTriggersDisabled(async () => {
    if (reset) {
      // Everything the seed does not own: other tenants, other users, and every
      // operational row of the demo tenant (the seed rewrites its own below).
      const { rows: foreign } = await query("SELECT id FROM tenants WHERE id <> $1", [tenantId]);
      const foreignTenantIds = foreign.map(({ id }) => id);
      const { rows: foreignUsers } = await query(
        "SELECT id FROM users WHERE email <> ALL($1::text[])",
        [accounts.map(({ email }) => email)],
      );
      const foreignUserIds = foreignUsers.map(({ id }) => id);
      await purgeOperationalRows([tenantId, ...foreignTenantIds], { all: true });
      await query("DELETE FROM contact_addresses WHERE tenant_id = ANY($1::uuid[])", [[tenantId, ...foreignTenantIds]]);
      await query("DELETE FROM contacts WHERE tenant_id = ANY($1::uuid[])", [[tenantId, ...foreignTenantIds]]);
      await query(
        "DELETE FROM shipment_rate_limits WHERE tenant_id = ANY($1::uuid[]) OR actor_id = ANY($2::text[])",
        [[tenantId, ...foreignTenantIds], foreignUserIds],
      );
      await query(
        "DELETE FROM mengantar_credential_rate_limits WHERE tenant_id = ANY($1::uuid[]) OR actor_id = ANY($2::text[])",
        [[tenantId, ...foreignTenantIds], foreignUserIds],
      );
      // The demo outlet keeps its Mengantar connection: it may hold a developer's
      // own credential. Any other outlet of the demo tenant (a browser audit adds
      // one) goes with everything configured on it.
      for (const table of ["mengantar_connections", "managed_secret_payloads", "outlet_pickup_points"]) {
        await query(
          `DELETE FROM ${table} WHERE tenant_id = ANY($1::uuid[]) OR (tenant_id = $2 AND outlet_id <> $3)`,
          [foreignTenantIds, tenantId, outletId],
        );
      }
      await query("DELETE FROM tenant_shipment_counters WHERE tenant_id = ANY($1::uuid[])", [foreignTenantIds]);
      await query("DELETE FROM outlets WHERE tenant_id = $1 AND id <> $2", [tenantId, outletId]);
      await query(
        `DELETE FROM audit_events WHERE tenant_id = ANY($1::uuid[])
           OR (target_type = 'TENANT' AND target_id = ANY($2::text[]))
           OR actor_id = ANY($3::text[])`,
        [foreignTenantIds, foreignTenantIds, foreignUserIds],
      );
      await query(
        "DELETE FROM memberships WHERE tenant_id = ANY($1::uuid[]) OR user_id = ANY($2::text[])",
        [foreignTenantIds, foreignUserIds],
      );
      await query("DELETE FROM outlets WHERE tenant_id = ANY($1::uuid[])", [foreignTenantIds]);
      await query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [foreignTenantIds]);
      await query("DELETE FROM platform_roles WHERE user_id = ANY($1::text[])", [foreignUserIds]);
      // sessions and accounts cascade from users.
      await query("DELETE FROM users WHERE id = ANY($1::text[])", [foreignUserIds]);
      await query("DELETE FROM verifications");
    } else {
      // Only the seed's own rows are replaced; rows a developer created stay.
      const legacyReconciliationIds = [1, 2].map((index) => fixedUuid("79", index));
      await purgeOperationalRows([tenantId], {
        shipmentIds,
        pullIds: settlementPulls.map(({ id }) => id),
        runIds: [...legacyReconciliationIds, ...Array.from({ length: 14 }, (_, index) => fixedUuid("79", index + 1))],
      });
      const seedContactIds = [...contacts.map(({ id }) => id), fixedUuid("71", 16)];
      await query("DELETE FROM contact_addresses WHERE tenant_id = $1 AND contact_id = ANY($2::uuid[])", [tenantId, seedContactIds]);
      await query("DELETE FROM contacts WHERE tenant_id = $1 AND id = ANY($2::uuid[])", [tenantId, seedContactIds]);
    }
    await query("DELETE FROM rate_limits");
    await query("DELETE FROM public_auth_rate_limits");
  });

  // Numbers restart after whatever shipments remain, so a re-seed allocates the same references.
  await query(
    `UPDATE tenant_shipment_counters
       SET last_number = (SELECT max(tenant_number) FROM shipments WHERE tenant_id = $1)
     WHERE tenant_id = $1`,
    [tenantId],
  );

  await query(
    `INSERT INTO tenants (id, name, status, contact_whatsapp, created_at)
       VALUES ($1, $2, 'ACTIVE', $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, status = 'ACTIVE', contact_whatsapp = EXCLUDED.contact_whatsapp, updated_at = now()`,
    [tenantId, TENANT_NAME, TENANT_WHATSAPP, at(90, 9)],
  );
  await query(
    `INSERT INTO outlets (
       id, tenant_id, name, default_pickup_address_id, default_pickup_address_label,
       default_origin_area_id, default_origin_area_label, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       default_pickup_address_id = EXCLUDED.default_pickup_address_id,
       default_pickup_address_label = EXCLUDED.default_pickup_address_label,
       default_origin_area_id = EXCLUDED.default_origin_area_id,
       default_origin_area_label = EXCLUDED.default_origin_area_label,
       updated_at = now()`,
    [
      outletId, tenantId, OUTLET_NAME, defaultPickup.pickupAddressId, defaultPickup.pickupAddressLabel,
      defaultPickup.originAreaId, defaultPickup.originAreaLabel, at(90, 9),
    ],
  );
  // Pickup points are seed-owned configuration: outlets.default_* mirrors the default row.
  await query("DELETE FROM outlet_pickup_points WHERE tenant_id = $1 AND outlet_id = $2", [tenantId, outletId]);
  for (const point of pickupPoints) {
    await query(
      `INSERT INTO outlet_pickup_points (
         id, tenant_id, outlet_id, pickup_address_id, pickup_address_label,
         origin_area_id, origin_area_label, is_default, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
      [
        point.id, tenantId, outletId, point.pickupAddressId, point.pickupAddressLabel,
        point.originAreaId, point.originAreaLabel, point.isDefault, at(80, 10),
      ],
    );
  }

  const userIds = new Map();
  for (const account of accounts) {
    const user = await query(
      `INSERT INTO users (id, name, email, email_verified, status)
         VALUES ($1, $2, $3, true, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, email_verified = true, status = 'ACTIVE', updated_at = now()
         RETURNING id`,
      [randomUUID(), account.name, account.email],
    );
    const userId = user.rows[0].id;
    userIds.set(account.role, userId);
    await query(
      `INSERT INTO accounts (id, account_id, provider_id, issuer, user_id, password)
         VALUES ($1, $2, 'credential', $3, $2, $4)
         ON CONFLICT (issuer, account_id) DO UPDATE SET password = EXCLUDED.password, updated_at = now()`,
      [randomUUID(), userId, issuer, passwordHash],
    );
    if (account.role !== "SUPER_ADMIN") {
      await query(
        `INSERT INTO memberships (tenant_id, user_id, role, status)
           VALUES ($1, $2, $3, 'ACTIVE')
           ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'ACTIVE', updated_at = now()`,
        [tenantId, userId, account.role],
      );
    } else {
      await query("INSERT INTO platform_roles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [userId]);
    }
  }
  const adminUserId = userIds.get("TENANT_ADMIN");
  const superUserId = userIds.get("SUPER_ADMIN");
  const userFor = (role) => userIds.get(role);

  for (const contact of contacts) {
    const updatedAt = contact.archivedAt ?? contact.createdAt;
    await query(
      `INSERT INTO contacts (id, tenant_id, name, phone, is_recipient, is_sender, archived_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [contact.id, tenantId, contact.name, contact.phone, contact.isRecipient, contact.isSender, contact.archivedAt, contact.createdAt, updatedAt],
    );
    for (const address of contact.addresses) {
      await query(
        `INSERT INTO contact_addresses (
           id, tenant_id, contact_id, label, address, destination_area_id,
           destination_area_label, is_primary, archived_at, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          address.id, tenantId, contact.id, address.label, address.street, address.area.id,
          address.area.label, address.isPrimary, contact.archivedAt, contact.createdAt, updatedAt,
        ],
      );
    }
  }

  const ledgerRows = [];
  const appendLedger = (shipment, entries, source) => {
    for (const [entryType, financialClass, amountIdr] of entries) {
      ledgerRows.push({ shipment, entryType, financialClass, amountIdr, ...source });
    }
  };

  for (const shipment of creationOrder) {
    const actor = userFor(shipment.creator);
    const updatedAt = shipment.status === "DRAFT"
      ? shipment.createdAt
      : shipment.issued
        ? shipment.pullDay
          ? plus(at(shipment.pullDay, 10), shipment.status === "RTS_RECEIVED" ? 3 * DAY : shipment.status === "RTS_IN_TRANSIT" ? DAY : 0)
          : shipment.issuedAt
        : shipment.status === "ESTIMATED" ? shipment.estimateAt : shipment.resolvedAt;
    // The allocation trigger records the creator from the transaction context,
    // exactly as a signed-in operator creating the draft does.
    await query("SELECT set_config('app.user_id', $1, true)", [actor]);
    await query(
      `INSERT INTO shipments (id, tenant_id, outlet_id, status, cogs_amount_idr, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [shipment.id, tenantId, outletId, shipment.status, shipment.cogsAmountIdr, shipment.createdAt, updatedAt],
    );
    await query("SELECT set_config('app.user_id', '', true)");

    await query(
      `INSERT INTO shipment_drafts (
         shipment_id, tenant_id, destination_area_id, destination_area_label,
         package_content, package_weight_grams, package_quantity,
         package_length_cm, package_width_cm, package_height_cm,
         declared_value_idr, is_cod, cod_shipping_only, cogs_amount_idr, shipping_instruction,
         recipient_address_landmark, destination_area_verified_at, pickup_address_id, origin_area_id,
         created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
      [
        shipment.id, tenantId, shipment.recipientAddress.area.id, shipment.recipientAddress.area.label,
        shipment.quantity > 1 ? `${shipment.product.content} (${shipment.quantity} pcs)` : shipment.product.content,
        shipment.grams, shipment.quantity, ...shipment.product.dims,
        shipment.goodsValueIdr, shipment.isCod, shipment.codShippingOnly, shipment.cogsAmountIdr,
        shipment.shippingInstruction, shipment.landmark, shipment.createdAt,
        shipment.pickup.pickupAddressId, shipment.pickup.originAreaId,
        shipment.createdAt, shipment.status === "DRAFT" ? shipment.createdAt : shipment.estimateAt,
      ],
    );
    for (const [role, party] of [["SENDER", shipment.sender], ["RECIPIENT", shipment.recipient]]) {
      const isRecipient = role === "RECIPIENT";
      await query(
        `INSERT INTO shipment_parties (
           id, tenant_id, shipment_id, role, name, phone, address,
           destination_area_id, destination_area_label, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          fixedUuid(isRecipient ? "7d" : "7c", shipment.n), tenantId, shipment.id, role, party.name, party.phone,
          isRecipient ? shipment.recipientAddress.street : shipment.pickup.streetAddress,
          isRecipient ? shipment.recipientAddress.area.id : null,
          isRecipient ? shipment.recipientAddress.area.label : null,
          shipment.createdAt,
        ],
      );
    }
    if (shipment.status === "DRAFT") continue;

    await query(
      `INSERT INTO shipment_estimate_snapshots (
         id, tenant_id, shipment_id, outlet_id, origin_area_id, destination_area_id,
         destination_area_label, weight_grams, is_cod_requested, credential_source, retrieved_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'platform_default', $10)`,
      [
        shipment.estimateSnapshotId, tenantId, shipment.id, outletId, shipment.pickup.originAreaId,
        shipment.recipientAddress.area.id, shipment.recipientAddress.area.label, shipment.grams,
        shipment.isCod, shipment.estimateAt,
      ],
    );
    const estimateServiceIds = new Map();
    for (const [offset, service] of shipment.quotes.entries()) {
      const serviceId = fixedUuid("74", shipment.n * 10 + offset);
      estimateServiceIds.set(service.providerService, serviceId);
      await query(
        `INSERT INTO shipment_estimate_services (
           id, tenant_id, snapshot_id, provider_service, currency, shipping_amount_idr,
           shipping_source_field, insurance_amount_idr, insurance_source_field, delivery_estimate,
           cod_eligible, normal_price_idr, special_price_idr, cod_fee_idr, discount_idr
         ) VALUES ($1, $2, $3, $4, 'IDR', $5, 'price', NULL, NULL, $6, $7, $8, $9, $10, $11)`,
        [
          serviceId, tenantId, shipment.estimateSnapshotId, service.providerService, service.shippingAmountIdr,
          service.deliveryEstimate, service.codEligible, service.normalPriceIdr, service.specialPriceIdr,
          service.codFeeIdr, service.discountIdr,
        ],
      );
    }
    const estimateServiceId = estimateServiceIds.get(shipment.selected.providerService);

    if (shipment.cod) {
      await query(
        `INSERT INTO shipment_cod_totals (
           id, tenant_id, shipment_id, snapshot_id, estimate_service_id, currency,
           goods_value_idr, shipping_amount_idr, service_fee_idr, vat_amount_idr,
           provider_cod_amount_idr, created_at, cod_formula_version, cod_shipping_basis_idr
         ) VALUES ($1, $2, $3, $4, $5, 'IDR', $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          shipment.codTotalId, tenantId, shipment.id, shipment.estimateSnapshotId, estimateServiceId,
          shipment.goodsValueIdr, shipment.selected.shippingAmountIdr, shipment.cod.serviceFeeIdr,
          shipment.cod.vatAmountIdr, shipment.cod.providerCodAmountIdr,
          shipment.cod.codFormulaVersion === 3 ? shipment.submittedAt : shipment.estimateAt,
          shipment.cod.codFormulaVersion, shipment.cod.codShippingBasisIdr,
        ],
      );
    }
    if (shipment.status === "ESTIMATED") continue;

    const batchStatus = shipment.status === "SUBMISSION_QUEUED"
      ? "SUBMISSION_QUEUED"
      : shipment.status === "SUBMISSION_UNKNOWN"
        ? "SUBMISSION_UNKNOWN"
        : shipment.status === "FAILED" ? "FAILED" : "COMPLETED";
    await query(
      `INSERT INTO provider_batches (
         id, tenant_id, outlet_id, pickup_address_id, courier, credential_source,
         provider_account_key, idempotency_key, status, safe_error_code,
         submission_attempted_at, completed_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, 'platform_default', $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        shipment.batchId, tenantId, outletId, shipment.pickup.pickupAddressId, shipment.courier,
        PROVIDER_ACCOUNT_KEY, sha256(`local-demo:${shipment.id}`), batchStatus,
        batchStatus === "SUBMISSION_UNKNOWN" ? "PROVIDER_TIMEOUT" : batchStatus === "FAILED" ? "PROVIDER_REJECTED" : null,
        batchStatus === "SUBMISSION_QUEUED" ? null : shipment.submittedAt,
        ["COMPLETED", "FAILED"].includes(batchStatus) ? shipment.resolvedAt : null,
        shipment.submittedAt,
        batchStatus === "SUBMISSION_QUEUED" ? shipment.submittedAt : shipment.resolvedAt,
      ],
    );

    const orderStatus = shipment.issued
      ? "ISSUED"
      : shipment.status === "AWAITING_UPSTREAM_PAYMENT" ? "AWAITING_UPSTREAM_PAYMENT" : shipment.status;
    const accepted = shipment.issued || shipment.status === "AWAITING_UPSTREAM_PAYMENT";
    await query(
      `INSERT INTO provider_order_snapshots (
         id, tenant_id, batch_id, shipment_id, estimate_snapshot_id, estimate_service_id, position,
         provider_service, destination_area_id, destination_area_label, currency, shipping_amount_idr,
         insurance_amount_idr, is_cod, provider_cod_amount_idr, status, provider_order_id, is_paid,
         cnote_no, safe_response_code, resolved_at, created_at, provider_charged_shipping_idr
       ) VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9, 'IDR', $10, NULL, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
      [
        shipment.providerOrderSnapshotId, tenantId, shipment.batchId, shipment.id, shipment.estimateSnapshotId,
        estimateServiceId, shipment.selected.providerService, shipment.recipientAddress.area.id,
        shipment.recipientAddress.area.label, shipment.selected.shippingAmountIdr, shipment.isCod,
        shipment.cod?.providerCodAmountIdr ?? null, orderStatus,
        accepted ? shipment.providerOrderId : null,
        shipment.issued ? true : shipment.status === "AWAITING_UPSTREAM_PAYMENT" ? false : null,
        shipment.awb,
        shipment.flags.recovered ? "PAY_UNPAID_ACCEPTED"
          : accepted ? "ORDER_ACCEPTED"
            : shipment.status === "SUBMISSION_UNKNOWN" ? "PROVIDER_TIMEOUT"
              : shipment.status === "FAILED" ? "PROVIDER_REJECTED" : null,
        shipment.status === "SUBMISSION_QUEUED" ? null : shipment.issuedAt,
        shipment.submittedAt,
        shippingMengantarDeductsIdr(shipment.selected),
      ],
    );
    if (!shipment.issued) continue;

    const providerCostIdr = shippingMengantarDeductsIdr(shipment.selected);
    if (shipment.flags.recovered) {
      // Mengantar accepted the order unpaid; the admin paid it from the balance.
      await query(
        `INSERT INTO provider_unpaid_recoveries (
           id, tenant_id, batch_id, provider_order_snapshot_id, requested_by_user_id, status,
           safe_response_code, attempted_at, completed_at, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, 'COMPLETED', 'PAY_UNPAID_ACCEPTED', $6, $7, $8, $7)`,
        [
          shipment.recoveryId, tenantId, shipment.batchId, shipment.providerOrderSnapshotId, adminUserId,
          plus(shipment.recoveryCompletedAt, -60_000), shipment.recoveryCompletedAt,
          plus(shipment.recoveryCompletedAt, -5 * 60_000),
        ],
      );
      appendLedger(shipment, [
        ["MENGANTAR_SHIPPING_COST", "EXPENSE", providerCostIdr],
        ["NON_COD_UPSTREAM_PAYMENT", "MEMO", providerCostIdr],
      ], { sourceEvent: "UNPAID_RECOVERY_COMPLETED", sourceEventId: shipment.recoveryId, effectiveAt: shipment.recoveryCompletedAt, actor: adminUserId });
    } else {
      const entries = [["MENGANTAR_SHIPPING_COST", "EXPENSE", providerCostIdr]];
      if (shipment.isCod) {
        entries.unshift(["COD_PRINCIPAL_COLLECTABLE", "LIABILITY", shipment.cod.codFormulaVersion === 3 ? 0 : shipment.goodsValueIdr]);
        // T-193: the fee Mengantar keeps, VAT inside it; no VAT liability row.
        entries.push(["MENGANTAR_COD_FEE_COST", "EXPENSE", mengantarCodFeeIdr(shipment.cod.providerCodAmountIdr)]);
      }
      appendLedger(shipment, entries, {
        sourceEvent: "PROVIDER_ORDER_ISSUED",
        sourceEventId: shipment.providerOrderSnapshotId,
        effectiveAt: shipment.issuedAt,
        actor: actor,
      });
    }

    if (shipment.printedAt) {
      await query(
        `INSERT INTO print_events (
           id, tenant_id, shipment_id, provider_order_snapshot_id, sequence, outcome,
           reason_code, awb_snapshot, actor_user_id, actor_role, printed_at
         ) VALUES ($1, $2, $3, $4, 1, 'PRINTED', NULL, $5, $6, $7, $8)`,
        [
          fixedUuid("78", shipment.n * 10 + 1), tenantId, shipment.id, shipment.providerOrderSnapshotId,
          shipment.awb, actor, shipment.creator, shipment.printedAt,
        ],
      );
      if (shipment.index % 9 === 0) {
        // A reprint after a label jammed in the thermal printer.
        await query(
          `INSERT INTO print_events (
             id, tenant_id, shipment_id, provider_order_snapshot_id, sequence, outcome,
             reason_code, awb_snapshot, actor_user_id, actor_role, printed_at
           ) VALUES ($1, $2, $3, $4, 2, 'PRINTED', NULL, $5, $6, $7, $8)`,
          [
            fixedUuid("78", shipment.n * 10 + 2), tenantId, shipment.id, shipment.providerOrderSnapshotId,
            shipment.awb, actor, shipment.creator, plus(shipment.printedAt, 10 * 60_000),
          ],
        );
      }
    }
  }
  await query("SELECT set_config('app.user_id', '', true)");

  // Keep the demo tenant's prefix choosable when it was before this run: the
  // allocation trigger locks an unsaved prefix on a tenant's first number.
  if (previousCounter.length === 1) {
    await query(
      "UPDATE tenant_shipment_counters SET shipment_prefix_locked_at = $2::timestamptz WHERE tenant_id = $1",
      [tenantId, previousCounter[0].shipment_prefix_locked_at],
    );
    if (previousCounter[0].shipment_prefix_locked_at === null) {
      await query(
        `DELETE FROM audit_events
         WHERE action = 'SHIPMENT_PREFIX_LOCKED' AND target_id = $1 AND tenant_id IS NULL
           AND metadata->>'implicit' = 'true' AND created_at = now()`,
        [tenantId],
      );
    }
  }

  // Settlement pulls: what Mengantar reported, the transition it applied, and the
  // per-AWB reconciliation lines (subItem.amount = COD_AMOUNT − estimatedSpecialPrice,
  // estimatedSpecialPrice = special shipping + COD_AMOUNT × 0.0333 unrounded).
  const units = (idr) => BigInt(idr) * BigInt(BASIS_POINTS);
  const formatUnits = (value) => {
    const negative = value < BigInt(0);
    const magnitude = negative ? -value : value;
    const scale = BigInt(BASIS_POINTS);
    return `${negative ? "-" : ""}${magnitude / scale}.${String(magnitude % scale).padStart(4, "0")}`;
  };
  const observations = [];
  const settlementItems = [];
  for (const shipment of shipmentDefinitions.filter(({ pullDay }) => pullDay)) {
    const pull = pullForDay.get(shipment.pullDay);
    const providerStatus = shipment.status === "DELIVERED"
      ? "DELIVERED"
      : shipment.status === "PROBLEM" ? "DELIVERY PROBLEM" : "RTS";
    observations.push({
      pull, shipment, providerStatus, fromStatus: "ISSUED",
      mappedStatus: shipment.status === "DELIVERED" ? "DELIVERED" : shipment.status === "PROBLEM" ? "PROBLEM" : "RTS_QUEUED",
      outcome: "APPLIED",
    });
    const special = shippingMengantarDeductsIdr(shipment.selected);
    const invoice = (type) => ({
      providerInvoiceId: providerId(`invoice:${type}:${pull.day}:${shipment.courier}`),
      invoiceNumber: `INV-${type === "SETTLEMENT" ? "REC" : type === "CHARGE" ? "PAY" : "RFD"}-${at(pull.day, 0).toISOString().slice(0, 10).replaceAll("-", "")}-${shipment.courier.toUpperCase()}`,
      invoiceCreatedAt: plus(pull.createdAt, -2 * HOUR),
    });
    if (shipment.status === "DELIVERED" && shipment.isCod) {
      const cod = shipment.cod.providerCodAmountIdr;
      const feeUnits = BigInt(cod) * BigInt(MENGANTAR_COD_FEE_BASIS_POINTS);
      const estimatedSpecialUnits = units(special) + feeUnits;
      settlementItems.push({
        pull, shipment, itemType: "SETTLEMENT", ...invoice("SETTLEMENT"),
        amountIdr: formatUnits(units(cod) - estimatedSpecialUnits),
        codAmountIdr: cod, codFeeIdr: formatUnits(feeUnits), shippingAmountIdr: formatUnits(estimatedSpecialUnits),
      });
    }
    if (shipment.status.startsWith("RTS_") && shipment.isCod) {
      // Mengantar charges the return leg of a COD order from the balance.
      settlementItems.push({
        pull, shipment, itemType: "CHARGE", ...invoice("CHARGE"),
        amountIdr: formatUnits(-units(special)), codAmountIdr: 0, codFeeIdr: "0.0000", shippingAmountIdr: formatUnits(units(special)),
      });
    }
    if (shipment.flags.lost) {
      // Claim approved for a parcel the courier lost: the shipping is refunded.
      settlementItems.push({
        pull, shipment, itemType: "REFUND", ...invoice("REFUND"),
        amountIdr: formatUnits(-units(special)), codAmountIdr: null, codFeeIdr: null, shippingAmountIdr: null,
      });
    }
  }
  // The latest pull also re-reads older orders: a delivered one it already
  // transitioned (UNCHANGED) and printed ones still waiting for pickup.
  const latestPull = settlementPulls.at(-1);
  for (const shipment of shipmentDefinitions) {
    if (shipment.status === "DELIVERED" && shipment.pullDay === 6 && shipment.isCod) {
      observations.push({ pull: latestPull, shipment, providerStatus: "DELIVERED", fromStatus: "DELIVERED", mappedStatus: "DELIVERED", outcome: "UNCHANGED" });
    }
    if (shipment.status === "ISSUED" && shipment.printedAt && shipment.issuedAt < latestPull.createdAt) {
      observations.push({ pull: latestPull, shipment, providerStatus: "PENDING PICKUP", fromStatus: "ISSUED", mappedStatus: null, outcome: "NO_LIFECYCLE_STATE" });
    }
  }
  for (const pull of settlementPulls) {
    const pullItems = settlementItems.filter((item) => item.pull === pull);
    const pullObservations = observations.filter((observation) => observation.pull === pull);
    await query(
      `INSERT INTO provider_settlement_pulls (
         id, tenant_id, outlet_id, actor_user_id, credential_source, provider_account_key,
         period_start, period_end, invoice_count, order_count, matched_item_count,
         matched_status_count, unmatched_awb_count, created_at
       ) VALUES ($1, $2, $3, $4, 'platform_default', $5, $6, $7, NULL, NULL, $8, $9, NULL, $10)`,
      [
        pull.id, tenantId, outletId, adminUserId, PROVIDER_ACCOUNT_KEY, pull.periodStart, pull.periodEnd,
        pullItems.length, pullObservations.length, pull.createdAt,
      ],
    );
    for (const [position, item] of pullItems.entries()) {
      await query(
        `INSERT INTO provider_settlement_items (
           id, tenant_id, pull_id, shipment_id, outlet_id, item_type, provider_invoice_id,
           invoice_number, invoice_status, invoice_created_at, cnote_no, amount_idr,
           cod_amount_idr, cod_fee_idr, shipping_amount_idr, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'statusCleared', $9, $10, $11, $12, $13, $14, $15)`,
        [
          fixedUuid("83", settlementPulls.indexOf(pull) * 100 + position + 1), tenantId, pull.id, item.shipment.id, outletId,
          item.itemType, item.providerInvoiceId, item.invoiceNumber, item.invoiceCreatedAt, item.shipment.awb,
          item.amountIdr, item.codAmountIdr, item.codFeeIdr, item.shippingAmountIdr, pull.createdAt,
        ],
      );
    }
    for (const [position, observation] of pullObservations.entries()) {
      await query(
        `INSERT INTO provider_order_status_observations (
           id, tenant_id, pull_id, shipment_id, outlet_id, cnote_no, provider_status,
           observed_at, from_status, mapped_status, transition_outcome
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          fixedUuid("84", settlementPulls.indexOf(pull) * 100 + position + 1), tenantId, pull.id,
          observation.shipment.id, outletId, observation.shipment.awb, observation.providerStatus,
          pull.createdAt, observation.fromStatus, observation.mappedStatus, observation.outcome,
        ],
      );
    }
  }

  // Return handling after Mengantar reported RTS: the warehouse records the
  // parcel's way back (notes are what the RTS list shows).
  let rtsIndex = 1;
  for (const shipment of shipmentDefinitions.filter(({ status }) => status.startsWith("RTS_"))) {
    const reportedAt = at(shipment.pullDay, 10);
    const steps = [["RTS_QUEUED", "Penerima tidak dapat dihubungi setelah tiga kali percobaan antar; paket dijadwalkan kembali ke gudang.", 1 * HOUR]];
    if (shipment.status !== "RTS_QUEUED") {
      steps.push(["RTS_IN_TRANSIT", "Paket retur sudah dijemput kurir dan dalam perjalanan ke gudang asal.", 1 * DAY]);
    }
    if (shipment.status === "RTS_RECEIVED") {
      steps.push(["RTS_RECEIVED", "Barang retur diterima gudang dan dicek fisik: kondisi baik, masuk stok kembali.", 3 * DAY]);
    }
    for (const [status, notes, offset] of steps) {
      await query(
        "INSERT INTO shipment_rts_events (id, tenant_id, shipment_id, status, notes, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
        [fixedUuid("7e", rtsIndex++), tenantId, shipment.id, status, notes, plus(reportedAt, offset)],
      );
    }
  }

  // Ledger: issuance and recovery entries, then one manual reversal — the lost
  // parcel's shipping cost, refunded by the claim above.
  const ledgerIds = new Map();
  for (const [position, row] of ledgerRows.entries()) {
    const id = fixedUuid("7a", position + 1);
    ledgerIds.set(`${row.shipment.id}:${row.entryType}`, id);
    await query(
      `INSERT INTO ledger_entries (
         id, tenant_id, outlet_id, shipment_id, provider_batch_id, provider_order_snapshot_id,
         reconciliation_run_id, entry_type, financial_class, amount_idr, currency, effective_at,
         source_event, source_event_id, actor_type, actor_user_id, reverses_entry_id, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, $9, 'IDR', $10, $11, $12, 'USER', $13, NULL, $10)`,
      [
        id, tenantId, outletId, row.shipment.id, row.shipment.batchId, row.shipment.providerOrderSnapshotId,
        row.entryType, row.financialClass, row.amountIdr, row.effectiveAt, row.sourceEvent, row.sourceEventId, row.actor,
      ],
    );
  }
  const lost = shipmentDefinitions.find(({ flags }) => flags.lost);
  const lostShippingEntryId = ledgerIds.get(`${lost.id}:MENGANTAR_SHIPPING_COST`);
  const adjustmentAt = at(lost.pullDay - 1, 11);
  await query(
    `INSERT INTO ledger_entries (
       id, tenant_id, outlet_id, shipment_id, provider_batch_id, provider_order_snapshot_id,
       reconciliation_run_id, entry_type, financial_class, amount_idr, currency, effective_at,
       source_event, source_event_id, actor_type, actor_user_id, reverses_entry_id, created_at
     ) SELECT $1, tenant_id, outlet_id, shipment_id, provider_batch_id, provider_order_snapshot_id,
       NULL, 'ADJUSTMENT', financial_class, -amount_idr, 'IDR', $2,
       'MANUAL_ADJUSTMENT', id::text, 'USER', $3, id, $2
     FROM ledger_entries WHERE id = $4`,
    [fixedUuid("7b", 1), adjustmentAt, adminUserId, lostShippingEntryId],
  );

  // Reconciliation, as reconcileLedgerPeriod records it: one run per reconciled
  // type for the period, source totals from the issued orders and completed
  // recoveries, ledger totals from the entries (adjustments count toward the type
  // they reverse), and a RECONCILIATION memo entry carrying the variance.
  const reconciledTypes = [
    "COD_PRINCIPAL_COLLECTABLE", "MENGANTAR_SHIPPING_COST", "MENGANTAR_INSURANCE_COST",
    "MENGANTAR_COD_FEE_COST", "GERAICUAN_COD_SERVICE_FEE_REVENUE", "COD_SERVICE_FEE_VAT_PAYABLE",
    "NON_COD_UPSTREAM_PAYMENT",
  ];
  const [anchorYear, anchorMonth] = jakartaDate.split("-").map(Number);
  const monthStart = (year, month) => new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00+07:00`);
  const previousMonth = anchorMonth === 1 ? [anchorYear - 1, 12] : [anchorYear, anchorMonth - 1];
  const reconciliationPeriods = [
    { cadence: "MONTHLY", start: monthStart(...previousMonth), end: monthStart(anchorYear, anchorMonth), attempt: 1, recordedAt: plus(monthStart(anchorYear, anchorMonth), 9 * HOUR) },
    { cadence: "DAILY", start: at(lost.pullDay - 1, 0), end: at(lost.pullDay - 2, 0), attempt: 2, recordedAt: at(lost.pullDay - 2, 9) },
  ];
  let runIndex = 1;
  for (const period of reconciliationPeriods) {
    const attemptId = fixedUuid("85", period.attempt);
    const { rows: [totals] } = await query(
      // The source and ledger sides of captureLedgerReconciliationTotals
      // (src/db/ledger-repository.ts), reduced to the columns the seed writes.
      `WITH issued_source AS (
         SELECT
           coalesce(sum(CASE WHEN o.is_cod AND c.cod_formula_version <> 3 THEN c.goods_value_idr ELSE 0 END), 0) AS cod_principal,
           coalesce(sum(coalesce(o.provider_charged_shipping_idr, o.shipping_amount_idr)), 0) AS shipping,
           coalesce(sum(coalesce(o.insurance_amount_idr, 0)), 0) AS insurance,
           coalesce(sum(CASE WHEN o.is_cod AND legacy_fee.booked THEN c.service_fee_idr ELSE 0 END), 0) AS cod_revenue,
           coalesce(sum(CASE WHEN o.is_cod AND NOT legacy_fee.booked
             THEN CASE WHEN legacy_vat.booked THEN c.service_fee_idr::bigint
               ELSE (o.provider_cod_amount_idr::bigint * ${MENGANTAR_COD_FEE_BASIS_POINTS} + ${BASIS_POINTS / 2}) / ${BASIS_POINTS} END
             ELSE 0 END), 0) AS cod_fee_cost,
           coalesce(sum(CASE WHEN o.is_cod AND (legacy_fee.booked OR legacy_vat.booked) THEN c.vat_amount_idr ELSE 0 END), 0) AS cod_vat
         FROM provider_order_snapshots o
         JOIN provider_batches b ON b.id = o.batch_id AND b.tenant_id = o.tenant_id
         LEFT JOIN shipment_cod_totals c ON c.shipment_id = o.shipment_id AND c.tenant_id = o.tenant_id
         CROSS JOIN LATERAL (SELECT EXISTS (SELECT 1 FROM ledger_entries fee_entry WHERE fee_entry.tenant_id = o.tenant_id
           AND fee_entry.source_event = 'PROVIDER_ORDER_ISSUED' AND fee_entry.source_event_id = o.id::text
           AND fee_entry.entry_type = 'GERAICUAN_COD_SERVICE_FEE_REVENUE') AS booked) legacy_fee
         CROSS JOIN LATERAL (SELECT EXISTS (SELECT 1 FROM ledger_entries vat_entry WHERE vat_entry.tenant_id = o.tenant_id
           AND vat_entry.source_event = 'PROVIDER_ORDER_ISSUED' AND vat_entry.source_event_id = o.id::text
           AND vat_entry.entry_type = 'COD_SERVICE_FEE_VAT_PAYABLE') AS booked) legacy_vat
         WHERE o.tenant_id = $1 AND b.outlet_id = $2 AND o.status = 'ISSUED'
           AND o.resolved_at >= $3 AND o.resolved_at < $4
       ), recovery_source AS (
         SELECT coalesce(sum(coalesce(o.provider_charged_shipping_idr, o.shipping_amount_idr) + coalesce(o.insurance_amount_idr, 0)), 0) AS upstream
         FROM provider_unpaid_recoveries r
         JOIN provider_order_snapshots o ON o.id = r.provider_order_snapshot_id AND o.batch_id = r.batch_id AND o.tenant_id = r.tenant_id
         JOIN provider_batches b ON b.id = r.batch_id AND b.tenant_id = r.tenant_id
         WHERE r.tenant_id = $1 AND b.outlet_id = $2 AND r.status = 'COMPLETED' AND o.status = 'ISSUED'
           AND o.is_cod = false AND o.is_paid = true AND r.completed_at >= $3 AND r.completed_at < $4
       ), ledger_snapshot AS (
         SELECT coalesce(original.entry_type, e.entry_type) AS reconciled_type, e.amount_idr
         FROM ledger_entries e
         LEFT JOIN ledger_entries original ON original.id = e.reverses_entry_id AND original.tenant_id = e.tenant_id
         WHERE e.tenant_id = $1 AND e.outlet_id = $2 AND e.effective_at >= $3 AND e.effective_at < $4
           AND e.entry_type <> 'RECONCILIATION'
       )
       SELECT issued_source.*, recovery_source.upstream,
         (SELECT coalesce(jsonb_object_agg(reconciled_type, total), '{}') FROM (
            SELECT reconciled_type, sum(amount_idr)::bigint AS total FROM ledger_snapshot GROUP BY reconciled_type
          ) grouped) AS ledger_totals
       FROM issued_source CROSS JOIN recovery_source`,
      [tenantId, outletId, period.start, period.end],
    );
    const sourceTotals = {
      COD_PRINCIPAL_COLLECTABLE: Number(totals.cod_principal),
      MENGANTAR_SHIPPING_COST: Number(totals.shipping),
      MENGANTAR_INSURANCE_COST: Number(totals.insurance),
      MENGANTAR_COD_FEE_COST: Number(totals.cod_fee_cost),
      GERAICUAN_COD_SERVICE_FEE_REVENUE: Number(totals.cod_revenue),
      COD_SERVICE_FEE_VAT_PAYABLE: Number(totals.cod_vat),
      NON_COD_UPSTREAM_PAYMENT: Number(totals.upstream),
    };
    for (const entryType of reconciledTypes) {
      const sourceTotalIdr = sourceTotals[entryType];
      const ledgerTotalIdr = Number(totals.ledger_totals[entryType] ?? 0);
      const varianceIdr = sourceTotalIdr - ledgerTotalIdr;
      const runId = fixedUuid("79", runIndex);
      const sourceEventId = `reconciliation:${attemptId}:${entryType}`;
      await query(
        `INSERT INTO reconciliation_runs (
           id, tenant_id, outlet_id, cadence, reconciled_entry_type, period_start, period_end, currency,
           source_total_idr, ledger_total_idr, variance_idr, status, source_event_id, actor_user_id, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'IDR', $8, $9, $10, $11, $12, $13, $14)`,
        [
          runId, tenantId, outletId, period.cadence, entryType, period.start, period.end,
          sourceTotalIdr, ledgerTotalIdr, varianceIdr, varianceIdr === 0 ? "MATCHED" : "VARIANCE",
          sourceEventId, adminUserId, period.recordedAt,
        ],
      );
      await query(
        `INSERT INTO ledger_entries (
           id, tenant_id, outlet_id, shipment_id, provider_batch_id, provider_order_snapshot_id,
           reconciliation_run_id, entry_type, financial_class, amount_idr, currency, effective_at,
           source_event, source_event_id, actor_type, actor_user_id, reverses_entry_id, created_at
         ) VALUES ($1, $2, $3, NULL, NULL, NULL, $4, 'RECONCILIATION', 'MEMO', $5, 'IDR', $6,
           'RECONCILIATION_CLOSED', $7, 'USER', $8, NULL, $9)`,
        [fixedUuid("7b", 100 + runIndex), tenantId, outletId, runId, varianceIdr, period.end, sourceEventId, adminUserId, period.recordedAt],
      );
      runIndex += 1;
    }
  }

  // Self-service registrations, through the same database function the sign-up
  // form calls. An email that already exists returns NULL, so this is idempotent.
  for (const registration of registrations) {
    await query(
      "SELECT register_tenant_self_service($1, $2, $3, $4, $5) AS tenant_id",
      [registration.email, registration.ownerName, passwordHash, registration.storeName, registration.whatsapp],
    );
    const { rows: [owner] } = await query(
      `SELECT u.id AS user_id, u.email_verified, t.id AS tenant_id, t.status
       FROM users u JOIN memberships m ON m.user_id = u.id JOIN tenants t ON t.id = m.tenant_id
       WHERE u.email = $1`,
      [registration.email],
    );
    if (!owner) throw new Error(`Registration for ${registration.email} was not written.`);
    const registeredAt = at(registration.registeredDaysAgo, 8, 30);
    if (owner.status === "PROVISIONING") {
      // The function stamps now(); the demo backdates the sign-up itself.
      await query("UPDATE tenants SET created_at = $2, updated_at = $2 WHERE id = $1", [owner.tenant_id, registeredAt]);
      await query("UPDATE users SET created_at = $2, updated_at = $2 WHERE id = $1", [owner.user_id, registeredAt]);
      await query("UPDATE outlets SET created_at = $2, updated_at = $2 WHERE tenant_id = $1", [owner.tenant_id, registeredAt]);
      await query("UPDATE memberships SET created_at = $2, updated_at = $2 WHERE tenant_id = $1", [owner.tenant_id, registeredAt]);
      await query(
        "UPDATE audit_events SET created_at = $2 WHERE tenant_id = $1 AND action = 'TENANT_SELF_REGISTERED'",
        [owner.tenant_id, registeredAt],
      );
    }
    if (registration.emailVerified && !owner.email_verified) {
      // What opening the verification link does (users.email_verified false → true).
      await query("UPDATE users SET email_verified = true, updated_at = $2 WHERE id = $1", [owner.user_id, plus(registeredAt, 15 * 60_000)]);
    }
    if (registration.rejection && owner.status === "PROVISIONING") {
      await query("SELECT set_config('app.user_id', $1, true)", [superUserId]);
      await query(
        "SELECT * FROM review_tenant_registration($1, 'REJECT', $2, $3)",
        [owner.tenant_id, registration.rejection, fixedUuid("86", registrations.indexOf(registration) + 1)],
      );
      await query("SELECT set_config('app.user_id', '', true)");
    }
  }

  const { rows: [summary] } = await query(
    `SELECT
       (SELECT count(*)::int FROM memberships WHERE tenant_id = $1 AND status = 'ACTIVE') AS memberships,
       (SELECT count(*)::int FROM outlet_pickup_points WHERE tenant_id = $1) AS pickup_points,
       (SELECT jsonb_build_object(
          'senders_active', count(*) FILTER (WHERE is_sender AND archived_at IS NULL),
          'senders_archived', count(*) FILTER (WHERE is_sender AND archived_at IS NOT NULL),
          'recipients_active', count(*) FILTER (WHERE is_recipient AND archived_at IS NULL),
          'recipients_archived', count(*) FILTER (WHERE is_recipient AND archived_at IS NOT NULL),
          'dual_role', count(*) FILTER (WHERE is_sender AND is_recipient))
        FROM contacts WHERE tenant_id = $1 AND id = ANY($2::uuid[])) AS contacts,
       (SELECT count(*)::int FROM contact_addresses WHERE tenant_id = $1 AND contact_id = ANY($2::uuid[])) AS contact_addresses,
       (SELECT jsonb_object_agg(status, total ORDER BY status) FROM (
          SELECT status, count(*)::int AS total FROM shipments WHERE tenant_id = $1 AND id = ANY($3::uuid[]) GROUP BY status
        ) statuses) AS shipment_statuses,
       (SELECT jsonb_object_agg(method, total ORDER BY method) FROM (
          SELECT CASE WHEN NOT d.is_cod THEN 'NON_COD' WHEN d.cod_shipping_only THEN 'COD_ONGKIR' ELSE 'COD' END AS method, count(*)::int AS total
          FROM shipment_drafts d WHERE d.tenant_id = $1 AND d.shipment_id = ANY($3::uuid[]) GROUP BY 1
        ) methods) AS payment_methods,
       (SELECT jsonb_object_agg(courier, total ORDER BY courier) FROM (
          SELECT courier, count(*)::int AS total FROM provider_batches WHERE tenant_id = $1 GROUP BY courier
        ) couriers) AS batches_by_courier,
       (SELECT jsonb_object_agg(cod_formula_version, total) FROM (
          SELECT cod_formula_version, count(*)::int AS total FROM shipment_cod_totals WHERE tenant_id = $1 GROUP BY 1
        ) versions) AS cod_totals_by_version,
       (SELECT min(public_reference) || ' .. ' || max(public_reference) FROM shipments WHERE tenant_id = $1 AND id = ANY($3::uuid[])) AS references,
       (SELECT count(*)::int FROM print_events WHERE tenant_id = $1) AS print_events,
       (SELECT count(*)::int FROM shipment_rts_events WHERE tenant_id = $1) AS rts_events,
       (SELECT count(*)::int FROM provider_settlement_pulls WHERE tenant_id = $1) AS settlement_pulls,
       (SELECT jsonb_object_agg(item_type, total) FROM (
          SELECT item_type, count(*)::int AS total FROM provider_settlement_items WHERE tenant_id = $1 GROUP BY 1
        ) items) AS settlement_items,
       (SELECT jsonb_object_agg(transition_outcome, total) FROM (
          SELECT transition_outcome, count(*)::int AS total FROM provider_order_status_observations WHERE tenant_id = $1 GROUP BY 1
        ) outcomes) AS status_observations,
       (SELECT count(*)::int FROM provider_unpaid_recoveries WHERE tenant_id = $1) AS unpaid_recoveries,
       (SELECT jsonb_object_agg(entry_type, total ORDER BY entry_type) FROM (
          SELECT entry_type, count(*)::int AS total FROM ledger_entries WHERE tenant_id = $1 GROUP BY 1
        ) entries) AS ledger_entries,
       (SELECT jsonb_object_agg(cadence || ':' || status, total) FROM (
          SELECT cadence, status, count(*)::int AS total FROM reconciliation_runs WHERE tenant_id = $1 GROUP BY 1, 2
        ) runs) AS reconciliation_runs,
       (SELECT jsonb_agg(jsonb_build_object('store', t.name, 'status', t.status, 'policy', t.mengantar_credential_policy,
          'owner_verified', u.email_verified) ORDER BY t.created_at)
        FROM tenants t JOIN memberships m ON m.tenant_id = t.id JOIN users u ON u.id = m.user_id
        WHERE u.email = ANY($4::text[])) AS registrations`,
    [tenantId, contacts.map(({ id }) => id), shipmentIds, registrations.map(({ email }) => email)],
  );
  seedSummary = summary;

  const expectedStatuses = {};
  for (const { status } of shipmentDefinitions) expectedStatuses[status] = (expectedStatuses[status] ?? 0) + 1;
  const expectedLedgerEntries = ledgerRows.length + 1 + reconciliationPeriods.length * reconciledTypes.length;
  const actualLedgerEntries = Object.values(summary.ledger_entries ?? {}).reduce((total, count) => total + count, 0);
  const registrationStates = (summary.registrations ?? []).map(({ status }) => status).sort();
  // A plain re-seed leaves a registration the Super Admin already reviewed as it is.
  if (
    registrationStates.length !== registrations.length
    || (reset && JSON.stringify(registrationStates) !== JSON.stringify(["ARCHIVED", "PROVISIONING", "PROVISIONING"]))
  ) {
    throw new Error(`Registration fixtures are incomplete; transaction was not committed. ${JSON.stringify(summary.registrations)}`);
  }
  if (
    Object.keys(summary.shipment_statuses ?? {}).length !== Object.keys(expectedStatuses).length
    || Object.entries(expectedStatuses).some(([status, total]) => summary.shipment_statuses?.[status] !== total)
    || summary.pickup_points !== pickupPoints.length
    || summary.contacts.senders_archived < 1
    || summary.contacts.recipients_archived < 1
    || summary.contacts.dual_role < 2
    || (reset && actualLedgerEntries !== expectedLedgerEntries)
    || actualLedgerEntries < expectedLedgerEntries
  ) {
    throw new Error(`Local demo seed verification failed; transaction was not committed. ${JSON.stringify(summary)}`);
  }

  await query("COMMIT");
  if (reset) {
    console.log(JSON.stringify({ reset: true, before, after: await tenantTableCounts() }, null, 2));
  }
} catch (error) {
  await query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}

console.log("Seeded local demo data without provider calls:", JSON.stringify(seedSummary, null, 2));
