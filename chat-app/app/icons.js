export default function Icon({ name, size = 22 }) {
  const paths = {
    attach: <path d="m8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2m-8 13 9-9"/>,
    chat: <><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 3V11.5A8.5 8.5 0 0 1 9.5 3h3a8.5 8.5 0 0 1 8.5 8.5Z"/><path d="M7 10h8M7 14h5"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    send: <><path d="m3 3 19 9-19 9 4-9-4-9Z"/><path d="M7 12h15"/></>,
    smile: <><circle cx="12" cy="12" r="9"/><path d="M8 14a4 4 0 0 0 8 0M8 9h.01M16 9h.01"/></>,
    moon: <path d="M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10Z"/>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/></>,
    logout: <><path d="M9 4H4v16h5M13 7l5 5-5 5m-5-5h13"/></>,
    back: <path d="m14 5-7 7 7 7"/>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    laptop: <><rect x="4" y="3" width="16" height="13" rx="2"/><path d="M1 20h22M9 16v4m6-4v4"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.chat}</svg>;
}
