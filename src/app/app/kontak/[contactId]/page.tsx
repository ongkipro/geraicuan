import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  addContactAddressAction,
  archiveContactAction,
  updateContactAction,
} from "@/app/app/kontak/[contactId]/actions";
import { AlertRegion } from "@/app/_components/alert-region";
import { FocusRegion } from "@/app/app/focus-region";
import { getContact, listContactAddresses } from "@/db/contact-repository";
import { db } from "@/db/client";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";

export const metadata: Metadata = { robots: { index: false } };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchValue = string | string[] | undefined;

type ContactDetailPageProps = {
  params: Promise<{ contactId: string }>;
  searchParams: Promise<{
    alamatGagal?: SearchValue;
    alamatDisimpan?: SearchValue;
    arsipGagal?: SearchValue;
    arsipkan?: SearchValue;
    dibuat?: SearchValue;
    diarsipkan?: SearchValue;
    disimpan?: SearchValue;
    ubahGagal?: SearchValue;
  }>;
};

type FormError = { field: string; message: string };

const IDENTITY_ERRORS = [
  {
    field: "contactName",
    message: "Nama wajib diisi dan maksimal 120 karakter.",
  },
  { field: "contactPhone", message: "Nomor telepon kontak tidak valid." },
  { field: "roles", message: "Pilih minimal satu peran kontak." },
] as const;

const ADDRESS_ERRORS = [
  {
    field: "addressLabel",
    message: "Label alamat wajib diisi dan maksimal 60 karakter.",
  },
  {
    field: "addressText",
    message: "Alamat wajib diisi dan maksimal 500 karakter.",
  },
  { field: "areaId", message: "Pilih area tujuan yang valid." },
  {
    field: "areaLabel",
    message: "Isi nama area dan ID area sekaligus, atau kosongkan keduanya.",
  },
] as const;

function queryValue(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

function selectErrors(
  value: SearchValue,
  options: readonly FormError[],
): FormError[] {
  const requested = new Set((queryValue(value) ?? "").split(","));
  return options.filter(({ field }) => requested.has(field));
}

function FieldError({ error, id }: { error?: string; id: string }) {
  return error ? (
    <p className="ship-field-error" id={id}>
      {error}
    </p>
  ) : null;
}

function ContactNotFound() {
  return (
    <main className="ship-shell">
      <a className="sales-skip" href="#kontak-tidak-ditemukan">
        Lewati ke pemberitahuan
      </a>
      <header className="ship-header">
        <p className="ship-wordmark">GeraiCUAN</p>
        <Link href="/app/kontak">Kembali ke direktori</Link>
      </header>
      <section
        aria-labelledby="kontak-tidak-ditemukan"
        className="ship-blocked"
        role="status"
      >
        <h2 id="kontak-tidak-ditemukan">Kontak tidak ditemukan.</h2>
        <p>Kontak mungkin sudah dihapus atau bukan milik tenant Anda.</p>
        <Link href="/app/kontak">Kembali ke direktori</Link>
      </section>
    </main>
  );
}

async function requireTenantPrincipal() {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");
  return principal;
}

export default async function ContactDetailPage({
  params,
  searchParams,
}: ContactDetailPageProps) {
  const principal = await requireTenantPrincipal();
  const { contactId } = await params;
  const detail = UUID_PATTERN.test(contactId)
    ? await withTenantContext(
        db,
        principal.userId,
        principal.tenantId,
        async (tx, context) => {
          const item = await getContact(tx, context, contactId);
          if (!item) return null;
          const addresses = await listContactAddresses(tx, context, contactId);
          return { addresses, item };
        },
      )
    : null;

  if (!detail) return <ContactNotFound />;

  const query = await searchParams;
  const activeAddresses = detail.addresses.filter(
    (address) => !address.archivedAt,
  );
  const identityErrors = selectErrors(query.ubahGagal, IDENTITY_ERRORS);
  const addressErrors = selectErrors(query.alamatGagal, ADDRESS_ERRORS);
  const formErrors = [...identityErrors, ...addressErrors];
  const identityError = new Map(
    identityErrors.map(({ field, message }) => [field, message]),
  );
  const addressError = new Map(
    addressErrors.map(({ field, message }) => [field, message]),
  );
  const addressUnavailable =
    queryValue(query.alamatGagal) === "tidakTersedia";
  const archiveFailed = queryValue(query.arsipGagal) === "1";
  const archiveConfirmation =
    queryValue(query.arsipkan) === "1" &&
    principal.role === "TENANT_ADMIN" &&
    !detail.item.archivedAt;

  let status:
    | { body: string; className: "ship-blocked" | "ship-success"; title: string }
    | undefined;
  if (queryValue(query.dibuat) === "1") {
    status = {
      body: "Kontak siap dipakai pada draf baru.",
      className: "ship-success",
      title: "Kontak tersimpan.",
    };
  } else if (queryValue(query.disimpan) === "1") {
    status = {
      body: "Kiriman yang sudah dibuat tetap memakai data lama.",
      className: "ship-success",
      title: "Perubahan kontak tersimpan.",
    };
  } else if (queryValue(query.alamatDisimpan) === "1") {
    status = {
      body: "Alamat baru siap dipakai pada draf berikutnya.",
      className: "ship-success",
      title: "Alamat tersimpan.",
    };
  } else if (queryValue(query.diarsipkan) === "1") {
    status = {
      body: "Kontak tidak lagi muncul saat memilih pengirim atau penerima.",
      className: "ship-blocked",
      title: "Kontak diarsipkan.",
    };
  }

  return (
    <main className="ship-shell">
      <a className="sales-skip" href="#form-kontak">
        Lewati ke formulir kontak
      </a>
      <header className="ship-header">
        <p className="ship-wordmark">GeraiCUAN</p>
        <Link href="/app/kontak">Kembali ke direktori</Link>
      </header>

      <section className="ship-intro">
        <p className="sales-eyebrow">KONTAK</p>
        <h1>{detail.item.name}</h1>
        <p className="contact-tags">
          {detail.item.isSender ? (
            <span className="contact-tag">Pengirim</span>
          ) : null}
          {detail.item.isRecipient ? (
            <span className="contact-tag">Penerima</span>
          ) : null}
          {detail.item.archivedAt ? (
            <span className="contact-tag contact-tag-archived">Diarsipkan</span>
          ) : null}
        </p>
        {detail.item.archivedAt ? (
          <p className="bulk-hint">
            Kontak diarsipkan dan tidak muncul saat memilih kontak.
          </p>
        ) : null}
      </section>

      {status ? (
        <FocusRegion className={status.className} role="status">
          <h2>{status.title}</h2>
          <p>{status.body}</p>
        </FocusRegion>
      ) : null}

      {formErrors.length > 0 ? (
        <AlertRegion className="ship-error-summary">
          <h2>Periksa isian berikut</h2>
          <ul>
            {formErrors.map(({ field, message }) => (
              <li key={field}>
                <a href={`#${field}`}>{message}</a>
              </li>
            ))}
          </ul>
        </AlertRegion>
      ) : null}

      {addressUnavailable ? (
        <AlertRegion className="ship-blocked">
          <h2>Alamat tidak dapat ditambahkan.</h2>
          <p>
            Kontak mungkin sudah diarsipkan atau batas alamat aktif sudah
            tercapai. Muat ulang halaman sebelum mencoba lagi.
          </p>
        </AlertRegion>
      ) : archiveFailed ? (
        <AlertRegion className="ship-blocked">
          <h2>Kontak tidak dapat diarsipkan.</h2>
          <p>
            Hanya Tenant Admin yang dapat mengarsipkan kontak aktif. Muat ulang
            halaman sebelum mencoba lagi.
          </p>
        </AlertRegion>
      ) : null}

      <form action={updateContactAction} className="ship-form" id="form-kontak">
        <input name="contactId" type="hidden" value={detail.item.id} />
        <fieldset className="ship-group">
          <legend>Data kontak</legend>
          <label htmlFor="contactName">
            Nama kontak
            <input
              aria-describedby={
                identityError.has("contactName")
                  ? "contactName-error"
                  : undefined
              }
              aria-invalid={identityError.has("contactName")}
              autoComplete="name"
              defaultValue={detail.item.name}
              id="contactName"
              maxLength={120}
              name="contactName"
              required
            />
            <FieldError
              error={identityError.get("contactName")}
              id="contactName-error"
            />
          </label>
          <label htmlFor="contactPhone">
            Nomor telepon
            <input
              aria-describedby={
                identityError.has("contactPhone")
                  ? "contactPhone-error"
                  : undefined
              }
              aria-invalid={identityError.has("contactPhone")}
              autoComplete="tel"
              defaultValue={detail.item.phone}
              id="contactPhone"
              name="contactPhone"
              required
              type="tel"
            />
            <FieldError
              error={identityError.get("contactPhone")}
              id="contactPhone-error"
            />
          </label>
          <fieldset
            aria-describedby={
              identityError.has("roles") ? "roles-error" : undefined
            }
            aria-invalid={identityError.has("roles")}
            className="ship-payment"
            id="roles"
          >
            <legend>Peran kontak</legend>
            <label>
              <input
                defaultChecked={detail.item.isSender}
                name="roleSender"
                type="checkbox"
              />
              Bisa dipakai sebagai pengirim
            </label>
            <label>
              <input
                defaultChecked={detail.item.isRecipient}
                name="roleRecipient"
                type="checkbox"
              />
              Bisa dipakai sebagai penerima
            </label>
            <FieldError
              error={identityError.get("roles")}
              id="roles-error"
            />
          </fieldset>
        </fieldset>
        <p className="bulk-hint">
          Perubahan hanya berlaku untuk draf baru. Kiriman yang sudah dibuat
          tetap memakai data lama.
        </p>
        <button className="sales-primary ship-submit" type="submit">
          Simpan perubahan
        </button>
      </form>

      <section aria-labelledby="alamat-heading" className="bulk-outcome">
        <h2 id="alamat-heading">Alamat</h2>
        {activeAddresses.length > 0 ? (
          <ul className="contact-addresses" id="alamat">
            {activeAddresses.map((address) => (
              <li key={address.id}>
                <p className="contact-tags">
                  <strong>{address.label}</strong>
                  {address.isPrimary ? (
                    <span className="contact-tag">Alamat utama</span>
                  ) : null}
                </p>
                <p>{address.address}</p>
                <p className="bulk-hint">
                  {address.destinationAreaLabel &&
                  address.destinationAreaId
                    ? `Area: ${address.destinationAreaLabel} · ${address.destinationAreaId}`
                    : "Area belum diisi"}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="bulk-hint" id="alamat">
            Belum ada alamat aktif.
          </p>
        )}

        {!detail.item.archivedAt && activeAddresses.length < 20 ? (
          <form
            action={addContactAddressAction}
            className="ship-form"
            id="alamat-baru"
          >
            <input name="contactId" type="hidden" value={detail.item.id} />
            <fieldset className="ship-group">
              <legend>Alamat baru</legend>
              <label htmlFor="addressLabel">
                Label alamat
                <input
                  aria-describedby={
                    addressError.has("addressLabel")
                      ? "addressLabel-hint addressLabel-error"
                      : "addressLabel-hint"
                  }
                  aria-invalid={addressError.has("addressLabel")}
                  id="addressLabel"
                  maxLength={60}
                  name="addressLabel"
                  required
                />
                <span className="bulk-hint" id="addressLabel-hint">
                  Contoh: Gudang Bandung, Rumah, Toko Pusat.
                </span>
                <FieldError
                  error={addressError.get("addressLabel")}
                  id="addressLabel-error"
                />
              </label>
              <label htmlFor="addressText">
                Alamat lengkap
                <textarea
                  aria-describedby={
                    addressError.has("addressText")
                      ? "addressText-error"
                      : undefined
                  }
                  aria-invalid={addressError.has("addressText")}
                  autoComplete="street-address"
                  id="addressText"
                  maxLength={500}
                  name="addressText"
                  required
                  rows={3}
                />
                <FieldError
                  error={addressError.get("addressText")}
                  id="addressText-error"
                />
              </label>
              <div className="ship-pair">
                <label htmlFor="areaLabel">
                  Nama area
                  <input
                    aria-describedby={
                      addressError.has("areaLabel")
                        ? "areaLabel-error"
                        : undefined
                    }
                    aria-invalid={addressError.has("areaLabel")}
                    id="areaLabel"
                    maxLength={160}
                    name="areaLabel"
                  />
                  <FieldError
                    error={addressError.get("areaLabel")}
                    id="areaLabel-error"
                  />
                </label>
                <label htmlFor="areaId">
                  ID area
                  <input
                    aria-describedby={
                      addressError.has("areaId") ? "areaId-error" : undefined
                    }
                    aria-invalid={addressError.has("areaId")}
                    id="areaId"
                    maxLength={160}
                    name="areaId"
                  />
                  <FieldError
                    error={addressError.get("areaId")}
                    id="areaId-error"
                  />
                </label>
              </div>
              <p className="bulk-hint">
                Isi area bila kontak dipakai sebagai penerima agar area tujuan
                draf dapat diisi otomatis.
              </p>
            </fieldset>
            <button className="sales-primary ship-submit" type="submit">
              Simpan alamat
            </button>
          </form>
        ) : detail.item.archivedAt ? (
          <p className="bulk-hint">
            Kontak yang diarsipkan tidak dapat menerima alamat baru.
          </p>
        ) : (
          <p className="bulk-hint">
            Batas 20 alamat aktif per kontak sudah tercapai.
          </p>
        )}
      </section>

      <section aria-labelledby="arsip-heading" className="bulk-outcome">
        <h2 id="arsip-heading">Arsip kontak</h2>
        {detail.item.archivedAt ? (
          <p className="bulk-hint">Kontak ini sudah diarsipkan.</p>
        ) : principal.role !== "TENANT_ADMIN" ? (
          <p className="bulk-hint">
            Arsip kontak dikelola oleh Tenant Admin.
          </p>
        ) : archiveConfirmation ? (
          <AlertRegion className="ship-blocked" id="arsip-kontak">
            <h2>Arsipkan kontak ini?</h2>
            <p>
              Kontak tidak lagi muncul saat memilih pengirim atau penerima.
              Kiriman yang sudah dibuat tetap menyimpan data lama.
            </p>
            <p>
              Kontak yang diarsipkan dihapus permanen setelah 90 hari kecuali
              masih terwakili oleh data kiriman.
            </p>
            <form action={archiveContactAction} className="sales-actions">
              <input name="contactId" type="hidden" value={detail.item.id} />
              <button className="sales-primary ship-submit" type="submit">
                Ya, arsipkan kontak
              </button>
              <Link className="sales-secondary" href={`/app/kontak/${contactId}`}>
                Batal
              </Link>
            </form>
          </AlertRegion>
        ) : (
          <Link
            className="sales-secondary"
            href={`/app/kontak/${contactId}?arsipkan=1#arsip-kontak`}
          >
            Arsipkan
          </Link>
        )}
      </section>
    </main>
  );
}
