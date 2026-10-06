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
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <rect x="3" y="5.2" width="24" height="3.2" rx="1" fill="currentColor" stroke="none" />
      <path d="M10 8.4v2.2M20 8.4v2.2" />
      <path d="M10.2 10.4h9.6c-.15 4.4-.4 7.2-1.7 9.1L21.2 22.6H8.8l3.1-3.1c-1.3-1.9-1.55-4.7-1.7-9.1" />
      <path d="M8.8 22.6h12.4" />
      <path d="M15 13.2 13.1 16.1 16.4 18.6 13.6 21.4 15.4 23.6" />
      <path d="M15 22.6v1.6" />
      <circle cx="15" cy="26.2" r="1.7" fill="currentColor" stroke="none" />
      {unread ? (
        <circle cx="26.2" cy="4.4" r="2.7" fill="#dc2626" stroke="#fafaf9" strokeWidth="1.25" />
      ) : null}
    </svg>
  );
}
