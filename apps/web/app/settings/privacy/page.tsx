import { redirect } from "next/navigation";

import { fetchMe } from "@/lib/api";
import { PrivacyHeader } from "@/components/privacy/privacy-header";
import { WhatWeKeepBlock } from "@/components/privacy/what-we-keep-block";
import { DeleteAccountSection } from "@/components/privacy/delete-account-section";

export default async function PrivacyPage() {
  const user = await fetchMe();
  if (!user) redirect("/sign-in");

  return (
    <>
      <PrivacyHeader />
      <WhatWeKeepBlock />
      <DeleteAccountSection email={user.email} />
    </>
  );
}
