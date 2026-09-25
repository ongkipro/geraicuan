"use client";

import { useSearchParams } from "next/navigation";

import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { contactRoleLabel, DEFAULT_CONTACT_ROLE, parseContactRole } from "@/lib/contact-role-filter";

export default function NewContactLoading() {
  const role = parseContactRole(useSearchParams().get("peran")) ?? DEFAULT_CONTACT_ROLE;
  return (
    <PageContainer aria-busy="true">
      <PageHeader
        description="Simpan sekali, lalu pilih saat membuat draf kiriman."
        eyebrow="Data"
        title={`${contactRoleLabel(role)} baru`}
      />
      <div aria-label="Memuat formulir kontak" className="grid gap-6" role="status">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </CardHeader>
          <CardContent className="flex flex-wrap items-start gap-x-6 gap-y-5">
            <Skeleton className="h-16 w-full sm:w-80" />
            <Skeleton className="h-16 w-full sm:w-48" />
            <Skeleton className="h-16 w-full max-w-[42rem]" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </CardHeader>
          <CardContent className="grid gap-5">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
        <Skeleton className="h-11 w-36" />
        <span className="sr-only">Memuat formulir kontak…</span>
      </div>
    </PageContainer>
  );
}
