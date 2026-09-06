"use client";

import { Suspense } from "react";

import { SearchDialog } from "@/components/common/SearchDialog";
import { TransferHud } from "@/components/common/TransferHud";
import { NavigationProgress } from "@/components/layout/NavigationProgress";

export function AppChrome() {
  return (
    <>
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      <TransferHud />
      <SearchDialog />
    </>
  );
}
