export function CountryFlag({ code }: { code: string }) {
  if (code === 'CA') {
    return (
      <svg aria-hidden="true" className="h-4 w-6 shrink-0 rounded-[2px]" viewBox="0 0 24 16">
        <rect width="24" height="16" fill="#fff" />
        <rect width="5" height="16" fill="#d52b1e" />
        <rect x="19" width="5" height="16" fill="#d52b1e" />
        <path d="m12 3 .8 2.5 2-.8-1.1 2.2 1.8 1.2-2.3.2.3 2.5-1.5-1.5-1.5 1.5.3-2.5-2.3-.2L8.3 7 7.2 4.8l2 .8L10 3l1 1.2L12 3Z" fill="#d52b1e" />
      </svg>
    );
  }

  if (code === 'CM') {
    return (
      <svg aria-hidden="true" className="h-4 w-6 shrink-0 rounded-[2px]" viewBox="0 0 24 16">
        <rect width="8" height="16" fill="#007a5e" />
        <rect x="8" width="8" height="16" fill="#ce1126" />
        <rect x="16" width="8" height="16" fill="#fcd116" />
        <path d="m12 4 .7 2.1h2.2l-1.8 1.3.7 2.1L12 8.2l-1.8 1.3.7-2.1-1.8-1.3h2.2L12 4Z" fill="#fcd116" />
      </svg>
    );
  }

  if (code === 'FR') {
    return (
      <svg aria-hidden="true" className="h-4 w-6 shrink-0 rounded-[2px]" viewBox="0 0 24 16">
        <rect width="8" height="16" fill="#0055a4" />
        <rect x="8" width="8" height="16" fill="#fff" />
        <rect x="16" width="8" height="16" fill="#ef4135" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-4 w-6 shrink-0 rounded-[2px]" viewBox="0 0 24 16">
      <rect width="8" height="16" fill="#000" />
      <rect x="8" width="8" height="16" fill="#fdda24" />
      <rect x="16" width="8" height="16" fill="#ef3340" />
    </svg>
  );
}
