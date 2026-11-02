/** 模板 logo 槽位：标记 + CourseMatch 字标（可读性优先） */
export function AeyeBrand({ tag = "SE · 2026" }: { tag?: string }) {
  return (
    <div className="hero-top-logo header">
      <div className="hero-top-logo-img w-embed landing-brand-word">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" aria-hidden>
          <path
            d="M24.07 27.79L12.42 18.54l1.2-1.2 10.65 10.25-1.2 1.2zM8.5 23.65l-3.61 3.61-1.2-1.2 3.61-3.61 1.2 1.2zM14.83 16.14l-1.2 1.2L3.17 6.89l1.2-1.2 10.46 10.45zM23.57 8.61l-3.61 3.61-1.2-1.2 3.61-3.61 1.2 1.2z"
            fill="#0055FF"
          />
        </svg>
        <span className="landing-brand-name">CourseMatch</span>
      </div>
      <div className="hero-top-logo-tag">{tag}</div>
    </div>
  );
}
