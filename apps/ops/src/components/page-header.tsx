"use client";

import { useRouter } from "next/navigation";

interface PageHeaderProps {
  title: string;
  backHref?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, backHref, action }: PageHeaderProps) {
  const router = useRouter();

  function handleBack() {
    if (backHref) {
      router.push(backHref);
    } else {
      router.back();
    }
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        {/* Back arrow — visible below desktop */}
        <button
          onClick={handleBack}
          className="lg:hidden flex items-center justify-center h-12 w-12 shrink-0 rounded-lg text-muted hover:text-foreground active:bg-card-hover transition-colors"
          aria-label="Go back"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 4l-6 6 6 6" />
          </svg>
        </button>
        <h1 className="text-lg md:text-xl lg:text-2xl font-semibold text-foreground truncate">
          {title}
        </h1>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
