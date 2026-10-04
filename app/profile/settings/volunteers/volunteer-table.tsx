"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateVolunteerStatus, type VolunteerSignupRow, type VolunteerUpdateStatus } from "@/lib/actions/campaign";
import { Button } from "@/components/ui/button";

const ACTIONS: { status: VolunteerUpdateStatus; label: string }[] = [
  { status: "pending", label: "Pending" },
  { status: "accepted", label: "Accepted" },
  { status: "contacted", label: "Contacted" },
];

export function VolunteerTable({ rows }: { rows: VolunteerSignupRow[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(signupId: string, status: VolunteerUpdateStatus) {
    setPendingId(signupId);
    setError(null);
    const result = await updateVolunteerStatus(signupId, status);
    if (result.error) setError(result.error);
    setPendingId(null);
    router.refresh();
  }

  if (rows.length === 0) {
    return <p className="mt-8 text-sm leading-6 text-zinc-400">No pending or accepted volunteers yet.</p>;
  }

  return (
    <div className="mt-8 overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
            <th className="py-3 pr-4 font-medium">Name</th>
            <th className="py-3 pr-4 font-medium">Primary</th>
            <th className="py-3 pr-4 font-medium">Status</th>
            <th className="py-3 pr-4 font-medium">Date</th>
            <th className="py-3 pr-4 font-medium">Districts</th>
            <th className="py-3 font-medium">Update</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-zinc-800 align-top">
              <td className="py-3 pr-4 text-parchment">{row.name}</td>
              <td className="py-3 pr-4 text-zinc-300">{row.primaryLabel}</td>
              <td className="py-3 pr-4 capitalize text-zinc-300">{row.status}</td>
              <td className="py-3 pr-4 text-zinc-300">{row.createdAt.slice(0, 10)}</td>
              <td className="py-3 pr-4 text-zinc-300">{row.districts || "No districts filed"}</td>
              <td className="py-3">
                <div className="flex flex-wrap gap-2">
                  {ACTIONS.map((action) => (
                    <Button
                      key={action.status}
                      type="button"
                      size="sm"
                      variant={row.status === action.status ? "gold" : "outline"}
                      disabled={pendingId === row.id || row.status === action.status}
                      onClick={() => void setStatus(row.id, action.status)}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error ? <p className="mt-4 text-sm leading-6 text-zinc-300">{error}</p> : null}
    </div>
  );
}
