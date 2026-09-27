import type { ReactNode } from "react";

export const OG_SIZE = { width: 1200, height: 630 };

export type OgCard =
  | {
      kind: "debate";
      topic: string;
      leftName: string;
      rightName: string;
      leftElo: number;
      rightElo: number;
    }
  | {
      kind: "candidate";
      name: string;
      office: string;
      elo: number;
    }
  | {
      kind: "rankings";
      rows: { name: string; elo: number }[];
    };

export function clip(value: string, max: number) {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function Frame({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#09090b",
        color: "#f4f1ea",
        padding: "64px",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 22,
          letterSpacing: 6,
          color: "#e8d5a3",
          textTransform: "uppercase",
        }}
      >
        Where 2 Run
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 36,
          fontSize: 18,
          letterSpacing: 4,
          color: "#a1a1aa",
          textTransform: "uppercase",
        }}
      >
        {eyebrow}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 18,
          fontSize: 64,
          lineHeight: 1.05,
          letterSpacing: -1,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

export function OgCardImage({ card }: { card: OgCard }) {
  if (card.kind === "debate") {
    return (
      <Frame eyebrow="Debate matchup" title={clip(card.topic, 72)}>
        <div
          style={{
            display: "flex",
            marginTop: 48,
            justifyContent: "space-between",
            fontSize: 32,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex" }}>{clip(card.leftName, 28)}</div>
            <div style={{ display: "flex", marginTop: 8, color: "#e8d5a3", fontSize: 22 }}>
              {`ELO ${card.leftElo}`}
            </div>
          </div>
          <div style={{ display: "flex", color: "#a1a1aa" }}>vs</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex" }}>{clip(card.rightName, 28)}</div>
            <div style={{ display: "flex", marginTop: 8, color: "#e8d5a3", fontSize: 22 }}>
              {`ELO ${card.rightElo}`}
            </div>
          </div>
        </div>
      </Frame>
    );
  }

  if (card.kind === "candidate") {
    return (
      <Frame eyebrow={clip(card.office || "Candidate", 48)} title={clip(card.name, 32)}>
        <div style={{ display: "flex", marginTop: 48, fontSize: 42, color: "#e8d5a3" }}>
          {`ELO ${card.elo}`}
        </div>
      </Frame>
    );
  }

  const rows = card.rows.slice(0, 5);
  return (
    <Frame eyebrow="Live ELO" title="Rankings">
      <div style={{ display: "flex", flexDirection: "column", marginTop: 36, fontSize: 28 }}>
        {rows.length === 0 ? (
          <div style={{ display: "flex", color: "#a1a1aa" }}>No ranked candidates yet.</div>
        ) : (
          rows.map((row, index) => (
            <div
              key={`${row.name}-${index}`}
              style={{ display: "flex", justifyContent: "space-between", marginTop: index === 0 ? 0 : 12 }}
            >
              <div style={{ display: "flex" }}>{`${index + 1}. ${clip(row.name, 36)}`}</div>
              <div style={{ display: "flex", color: "#e8d5a3" }}>{String(row.elo)}</div>
            </div>
          ))
        )}
      </div>
    </Frame>
  );
}
