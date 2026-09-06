import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ModuleEditor } from "@/components/admin/ModuleEditor";
import { getHomeModule } from "@/lib/home/layout";

export const metadata: Metadata = {
  title: "编辑模块",
};

export default async function AdminModuleEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const moduleId = Number.parseInt(id, 10);
  if (!Number.isInteger(moduleId) || moduleId < 1) {
    notFound();
  }

  const item = await getHomeModule(moduleId);
  if (!item) {
    notFound();
  }

  return <ModuleEditor module={item.module} />;
}
