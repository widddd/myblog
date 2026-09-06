import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

function clientKnowsMustChange(): boolean {
  return Boolean(
    Prisma.dmmf.datamodel.models
      .find((model) => model.name === "AdminUser")
      ?.fields.some((field) => field.name === "mustChangeCredentials"),
  );
}

export async function hasPendingCredentialChange(adminId: number): Promise<boolean> {
  if (!clientKnowsMustChange()) {
    return false;
  }
  try {
    const extra = await prisma.adminUser.findUnique({
      where: { id: adminId },
      select: { mustChangeCredentials: true },
    });
    return Boolean(extra?.mustChangeCredentials);
  } catch {
    return false;
  }
}
