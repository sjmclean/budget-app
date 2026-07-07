import type { ReactNode } from "react";

type CategoryIconDefinition = {
  color: string;
  paths: ReactNode;
};

function normaliseCategoryName(categoryName: string) {
  return categoryName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getCategoryIconDefinition(categoryName: string): CategoryIconDefinition {
  const name = normaliseCategoryName(categoryName);

  if (name.includes("transfer")) {
    return {
      color: "teal",
      paths: (
        <>
          <path d="M7 7h10l-3-3" />
          <path d="M17 7l-3 3" />
          <path d="M17 17H7l3 3" />
          <path d="M7 17l3-3" />
        </>
      ),
    };
  }

  if (/(grocery|groceries|supermarket|food)/.test(name)) {
    return {
      color: "green",
      paths: (
        <>
          <circle cx="9" cy="20" r="1.5" />
          <circle cx="17" cy="20" r="1.5" />
          <path d="M3 4h2l2.2 10.5a2 2 0 0 0 2 1.5h7.7a2 2 0 0 0 1.9-1.4L21 8H7" />
        </>
      ),
    };
  }

  if (/(dining|restaurant|coffee|takeaway|take away|eating out)/.test(name)) {
    return {
      color: "orange",
      paths: (
        <>
          <path d="M7 3v18" />
          <path d="M4 3v5a3 3 0 0 0 6 0V3" />
          <path d="M17 3v18" />
          <path d="M14 3h3a3 3 0 0 1 0 6h-3z" />
        </>
      ),
    };
  }

  if (/(fuel|petrol|diesel|gas)/.test(name)) {
    return {
      color: "red",
      paths: (
        <>
          <path d="M6 3h8v18H6z" />
          <path d="M8 6h4" />
          <path d="M14 9h2.5L19 12v6a2 2 0 0 0 4 0v-5l-3-4" />
        </>
      ),
    };
  }

  if (/(car|vehicle|registration|parking|transport|bus|train|tram|public transport)/.test(name)) {
    return {
      color: "blue",
      paths: (
        <>
          <path d="M5 12l1.5-5h11L19 12" />
          <path d="M4 12h16v6H4z" />
          <circle cx="7" cy="18" r="1.5" />
          <circle cx="17" cy="18" r="1.5" />
        </>
      ),
    };
  }

  if (/(salary|income|wage|pay|bonus|money)/.test(name)) {
    return {
      color: "green",
      paths: (
        <>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <circle cx="12" cy="12" r="3" />
          <path d="M6 9v0" />
          <path d="M18 15v0" />
        </>
      ),
    };
  }

  if (/(interest|investment|dividend|growth)/.test(name)) {
    return {
      color: "blue",
      paths: (
        <>
          <path d="M4 19V5" />
          <path d="M4 19h16" />
          <path d="M7 15l4-4 3 3 5-7" />
        </>
      ),
    };
  }

  if (/(house|home|rent|mortgage|household)/.test(name)) {
    return {
      color: "purple",
      paths: (
        <>
          <path d="M3 11l9-8 9 8" />
          <path d="M5 10v11h14V10" />
          <path d="M10 21v-6h4v6" />
        </>
      ),
    };
  }

  if (/(electric|utility|utilities|power|water|internet|phone|mobile)/.test(name)) {
    return {
      color: "amber",
      paths: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
    };
  }

  if (/(health|medical|doctor|dentist|pharmacy)/.test(name)) {
    return {
      color: "red",
      paths: (
        <>
          <path d="M12 21s-7-4.4-9-9a5 5 0 0 1 8-5 5 5 0 0 1 8 5c-2 4.6-9 9-9 9z" />
        </>
      ),
    };
  }

  if (/(insurance|security|safe)/.test(name)) {
    return {
      color: "teal",
      paths: <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />,
    };
  }

  if (/(gift|present|donation)/.test(name)) {
    return {
      color: "green",
      paths: (
        <>
          <path d="M3 9h18v12H3z" />
          <path d="M12 9v12" />
          <path d="M3 13h18" />
          <path d="M7.5 9A2.5 2.5 0 1 1 12 7v2" />
          <path d="M16.5 9A2.5 2.5 0 1 0 12 7v2" />
        </>
      ),
    };
  }

  return {
    color: "slate",
    paths: (
      <>
        <path d="M4 7h16v13H4z" />
        <path d="M4 7l2-3h12l2 3" />
      </>
    ),
  };
}

export function CategoryIcon({
  categoryName,
  size = 16,
}: {
  categoryName: string;
  size?: number;
}) {
  const icon = getCategoryIconDefinition(categoryName);

  return (
    <span
      className={`category-icon category-icon-${icon.color}`}
      aria-hidden="true"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        {icon.paths}
      </svg>
    </span>
  );
}

export function CategoryLabel({
  categoryName,
}: {
  categoryName: string;
}) {
  if (!categoryName.trim()) {
    return <span>{categoryName}</span>;
  }

  return (
    <span className="category-label-with-icon">
      <CategoryIcon categoryName={categoryName} />
      <span>{categoryName}</span>
    </span>
  );
}
