export function LibertyBell({
  unread = false,
  className,
}: {
  unread?: boolean;
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 140"
      aria-hidden
      className={className}
    >
      <path
        fill="#111111"
        d="M28 4h22L36 44H16C6 44 2 34 2 22 2 10 12 4 28 4z"
      />
      <path
        fill="#111111"
        d="M92 4H70l14 40h20c10 0 14-10 14-22C118 10 108 4 92 4z"
      />
      <path
        fill="var(--gold)"
        fillRule="evenodd"
        d="M60 34c12 0 18 6 18 14 2 2 8 6 14 16 10 16 16 32 12 44-4 8-22 10-44 10s-40-2-44-10c-4-12 2-28 12-44 6-10 12-14 14-16 0-8 6-14 18-14zM50 40h4.2v12H50zm15.8 0H70v12h-4.2z"
      />
      <path
        d="M57 56C51 74 49 96 55 116"
        fill="none"
        stroke="#fafaf9"
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      <path fill="#111111" d="M52 114h16v4c0 8-3 12-8 12s-8-4-8-12z" />
      {unread ? (
        <circle cx="108" cy="12" r="8" fill="#dc2626" stroke="#fafaf9" strokeWidth="3" />
      ) : null}
    </svg>
  );
}
