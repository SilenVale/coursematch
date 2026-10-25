type IconName = "layout-dashboard" | "list-checks" | "clipboard-list" | "plus-square";

export function NavIcon({ name }: { name: IconName }) {
  switch (name) {
    case "layout-dashboard":
      return (
        <svg className="i" aria-hidden viewBox="0 0 24 24">
          <path d="M3 3h7v9H3z" />
          <path d="M14 3h7v5h-7z" />
          <path d="M14 12h7v9h-7z" />
          <path d="M3 16h7v5H3z" />
        </svg>
      );
    case "list-checks":
      return (
        <svg className="i" aria-hidden viewBox="0 0 24 24">
          <path d="M9 6h12" />
          <path d="M9 12h12" />
          <path d="M9 18h12" />
          <path d="M4 6l1.5 1.5L8 5" />
          <path d="M4 12l1.5 1.5L8 11" />
          <path d="M4 18l1.5 1.5L8 17" />
        </svg>
      );
    case "clipboard-list":
      return (
        <svg className="i" aria-hidden viewBox="0 0 24 24">
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <path d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
          <path d="M9 12h6" />
          <path d="M9 16h6" />
        </svg>
      );
    case "plus-square":
      return (
        <svg className="i" aria-hidden viewBox="0 0 24 24">
          <path d="M12 8v8" />
          <path d="M8 12h8" />
          <path d="M3 3h18v18H3z" />
        </svg>
      );
    default:
      return null;
  }
}
