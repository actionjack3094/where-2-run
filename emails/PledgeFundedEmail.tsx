import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export type PledgeFundedEmailProps = {
  candidateName: string;
  amount: number;
  electionId: string;
};

function formatUsd(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

const colors = {
  parchment: "#f4f1ea",
  card: "#ffffff",
  charcoal: "#1a1a1a",
  muted: "#4a4a4a",
  brass: "#c5a059",
  border: "#e6e1d6",
};

export function PledgeFundedEmail({
  candidateName,
  amount,
  electionId,
}: PledgeFundedEmailProps) {
  const dollars = formatUsd(amount);
  const campaign = candidateName.trim() || "this campaign";
  const race = electionId.trim() || "your selected race";
  const preview = `Receipt: ${dollars} pledged to ${campaign}`;

  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: colors.parchment,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          margin: 0,
          padding: "32px 16px",
        }}
      >
        <Container
          style={{
            backgroundColor: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: "8px",
            margin: "0 auto",
            maxWidth: "520px",
            padding: "32px 28px",
          }}
        >
          <Text
            style={{
              color: colors.brass,
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "0.16em",
              margin: "0 0 8px",
              textTransform: "uppercase",
            }}
          >
            Where 2 Run
          </Text>
          <Heading
            as="h1"
            style={{
              color: colors.charcoal,
              fontSize: "24px",
              fontWeight: 700,
              lineHeight: "1.25",
              margin: "0 0 8px",
            }}
          >
            Pledge funded
          </Heading>
          <Text style={{ color: colors.muted, fontSize: "15px", lineHeight: "1.5", margin: "0 0 24px" }}>
            Your checkout cleared. This amount is held in escrow until the
            candidate&apos;s alignment streak releases it.
          </Text>

          <Section
            style={{
              backgroundColor: colors.parchment,
              border: `1px solid ${colors.border}`,
              borderRadius: "6px",
              padding: "16px 18px",
            }}
          >
            <ReceiptRow label="Amount" value={dollars} emphasize />
            <ReceiptRow label="Campaign" value={campaign} />
            <ReceiptRow label="Race" value={race} last />
          </Section>

          <Hr style={{ borderColor: colors.border, margin: "24px 0 16px" }} />
          <Text style={{ color: colors.muted, fontSize: "12px", lineHeight: "1.5", margin: 0 }}>
            This is a receipt for your records. Funds stay with the platform
            until release conditions are met.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

function ReceiptRow({
  label,
  value,
  emphasize,
  last,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  last?: boolean;
}) {
  return (
    <Section
      style={{
        borderBottom: last ? "none" : `1px solid ${colors.border}`,
        margin: 0,
        padding: last ? "10px 0 0" : "10px 0",
      }}
    >
      <Text
        style={{
          color: colors.muted,
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.08em",
          margin: "0 0 4px",
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: colors.charcoal,
          fontSize: emphasize ? "22px" : "15px",
          fontWeight: emphasize ? 700 : 500,
          margin: 0,
        }}
      >
        {value}
      </Text>
    </Section>
  );
}

export default PledgeFundedEmail;
