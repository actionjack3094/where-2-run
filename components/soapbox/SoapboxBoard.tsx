"use client";

import { useState } from "react";
import { SoapboxComposer } from "@/components/soapbox/SoapboxComposer";
import { SoapboxFeed } from "@/components/soapbox/SoapboxFeed";
import { SoapboxTabs } from "@/components/soapbox/SoapboxTabs";
import { SEED_POSTS } from "@/components/soapbox/seed";
import type { SoapboxLens, SoapboxPost, SoapboxViewer } from "@/components/soapbox/types";

function focusComposer() {
  const field = document.getElementById("soapbox-composer");
  if (!(field instanceof HTMLTextAreaElement)) return;
  field.scrollIntoView({ behavior: "smooth", block: "center" });
  field.focus();
}

export function SoapboxBoard({ viewer }: { viewer: SoapboxViewer }) {
  const [activeTab, setActiveTab] = useState<SoapboxLens>("candidate");
  const [posts, setPosts] = useState<SoapboxPost[]>(SEED_POSTS);

  function onPost(text: string) {
    setPosts((current) => [
      {
        id: crypto.randomUUID(),
        name: viewer.name,
        text,
        lens: activeTab,
        badge: activeTab === "candidate" ? "PROSPECTIVE" : null,
        matchPercent: null,
        district: viewer.district,
        zip: viewer.zip,
        clip: false,
      },
      ...current,
    ]);
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-8">
      <SoapboxTabs activeTab={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        <SoapboxComposer
          activeTab={activeTab}
          name={viewer.name}
          districtLabel={viewer.district}
          onPost={onPost}
        />
      </div>
      <SoapboxFeed
        posts={posts}
        activeTab={activeTab}
        homeZip={viewer.zip}
        homeDistrict={viewer.district}
        onTakeMic={focusComposer}
      />
    </div>
  );
}
