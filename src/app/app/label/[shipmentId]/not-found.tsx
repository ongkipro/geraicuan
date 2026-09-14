"use client";

import { FileQuestion } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/cms/empty-state";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { useFocusTargetOnMount } from "@/components/cms/retry-region-button";
import { Button } from "@/components/ui/button";

const HEADING_ID = "label-not-found-heading";

export default function LabelNotFound() {
  useFocusTargetOnMount(HEADING_ID);
  return (
    <PageContainer>
      <PageHeader description="Kiriman mungkin tidak tersedia atau bukan milik tenant aktif." eyebrow="Label 100 × 150 mm" focusTargetId={HEADING_ID} title="Label tidak ditemukan" />
      <EmptyState
        action={<div className="flex flex-col gap-2 sm:flex-row"><Button asChild className="min-h-11"><Link href="/app/label">Buka daftar label</Link></Button><Button asChild className="min-h-11" variant="outline"><Link href="/app/pengiriman">Buka daftar kiriman</Link></Button></div>}
        description="Pilih kiriman yang masih tersedia tanpa mengubah riwayat cetak."
        icon={FileQuestion}
        title="Detail label tidak tersedia"
      />
    </PageContainer>
  );
}
