import type { SVGProps } from "react";

export type IconName =
  | "home"
  | "building"
  | "users"
  | "user"
  | "pipeline"
  | "zap"
  | "form"
  | "chat"
  | "mail"
  | "sms"
  | "book"
  | "file"
  | "invoice"
  | "card"
  | "search"
  | "bell"
  | "help"
  | "megaphone"
  | "chev-r"
  | "chev-d"
  | "chev-u"
  | "plus"
  | "check"
  | "x"
  | "edit"
  | "trash"
  | "more"
  | "filter"
  | "download"
  | "upload"
  | "calendar"
  | "note"
  | "task"
  | "phone"
  | "tag"
  | "flag"
  | "globe"
  | "link"
  | "copy"
  | "eye"
  | "arrow-r"
  | "arrow-u"
  | "arrow-d"
  | "sort"
  | "sliders";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 16, ...props }: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5 10v10h14V10" />
        </svg>
      );
    case "building":
      return (
        <svg {...common}>
          <rect x="4" y="3" width="16" height="18" rx="1" />
          <path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1" />
          <path d="M10 21v-3h4v3" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
        </svg>
      );
    case "pipeline":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="4" height="16" rx="1" />
          <rect x="10" y="4" width="4" height="10" rx="1" />
          <rect x="17" y="4" width="4" height="14" rx="1" />
        </svg>
      );
    case "zap":
      return (
        <svg {...common}>
          <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
        </svg>
      );
    case "form":
      return (
        <svg {...common}>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </svg>
      );
    case "chat":
      return (
        <svg {...common}>
          <path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.5A8 8 0 1 1 21 12Z" />
        </svg>
      );
    case "mail":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
      );
    case "sms":
      return (
        <svg {...common}>
          <path d="M21 11.5a8.4 8.4 0 0 1-1.4 4.6l1.2 4.4-4.6-1.2A8.5 8.5 0 1 1 21 11.5Z" />
          <path d="M8 11h.01M12 11h.01M16 11h.01" />
        </svg>
      );
    case "book":
      return (
        <svg {...common}>
          <path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2Z" />
          <path d="M4 19a2 2 0 0 0 2 2h12" />
        </svg>
      );
    case "file":
      return (
        <svg {...common}>
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <path d="M14 3v6h6" />
        </svg>
      );
    case "invoice":
      return (
        <svg {...common}>
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <path d="M14 3v6h6M8 13h8M8 17h5" />
        </svg>
      );
    case "card":
      return (
        <svg {...common}>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20M6 15h3" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9Z" />
          <path d="M10 21a2 2 0 0 0 4 0" />
        </svg>
      );
    case "help":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 1-1 1.7" />
          <path d="M12 17h.01" />
        </svg>
      );
    case "megaphone":
      return (
        <svg {...common}>
          <path d="M3 11v2a1 1 0 0 0 1 1h2l8 5V5L6 10H4a1 1 0 0 0-1 1Z" />
          <path d="M18 8a4 4 0 0 1 0 8" />
        </svg>
      );
    case "chev-r":
      return (
        <svg {...common}>
          <path d="m9 18 6-6-6-6" />
        </svg>
      );
    case "chev-d":
      return (
        <svg {...common}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      );
    case "chev-u":
      return (
        <svg {...common}>
          <path d="m18 15-6-6-6 6" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="m5 12 4 4 10-10" />
        </svg>
      );
    case "x":
      return (
        <svg {...common}>
          <path d="m6 6 12 12M6 18 18 6" />
        </svg>
      );
    case "edit":
      return (
        <svg {...common}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      );
    case "trash":
      return (
        <svg {...common}>
          <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
        </svg>
      );
    case "more":
      return (
        <svg {...common}>
          <circle cx="5" cy="12" r="1.4" />
          <circle cx="12" cy="12" r="1.4" />
          <circle cx="19" cy="12" r="1.4" />
        </svg>
      );
    case "filter":
      return (
        <svg {...common}>
          <path d="M3 5h18l-7 9v6l-4-2v-4Z" />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path d="M12 4v12m0 0 4-4m-4 4-4-4" />
          <path d="M4 20h16" />
        </svg>
      );
    case "upload":
      return (
        <svg {...common}>
          <path d="M12 20V8m0 0 4 4m-4-4-4 4" />
          <path d="M4 4h16" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 9h18M8 3v4M16 3v4" />
        </svg>
      );
    case "note":
      return (
        <svg {...common}>
          <path d="M4 4h12l4 4v12H4Z" />
          <path d="M16 4v4h4" />
        </svg>
      );
    case "task":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m8 12 3 3 5-6" />
        </svg>
      );
    case "phone":
      return (
        <svg {...common}>
          <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19 19 0 0 1-8.3-3 19 19 0 0 1-6-6 19 19 0 0 1-3-8.4A2 2 0 0 1 4.5 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8.1 9.7a16 16 0 0 0 6 6l1.4-1.4a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2Z" />
        </svg>
      );
    case "tag":
      return (
        <svg {...common}>
          <path d="M20 12 12 20l-8-8V4h8Z" />
          <circle cx="8" cy="8" r="1.4" fill="currentColor" />
        </svg>
      );
    case "flag":
      return (
        <svg {...common}>
          <path d="M4 21V4h11l-1 4h7l-1 5h-7l1 4H4" />
        </svg>
      );
    case "globe":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
      );
    case "link":
      return (
        <svg {...common}>
          <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
          <path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
        </svg>
      );
    case "copy":
      return (
        <svg {...common}>
          <rect x="9" y="9" width="12" height="12" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      );
    case "eye":
      return (
        <svg {...common}>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "arrow-r":
      return (
        <svg {...common}>
          <path d="M5 12h14m-4-4 4 4-4 4" />
        </svg>
      );
    case "arrow-u":
      return (
        <svg {...common}>
          <path d="M12 19V5m-4 4 4-4 4 4" />
        </svg>
      );
    case "arrow-d":
      return (
        <svg {...common}>
          <path d="M12 5v14m-4-4 4 4 4-4" />
        </svg>
      );
    case "sort":
      return (
        <svg {...common}>
          <path d="m8 4 0 16m0-16-3 3m3-3 3 3M16 20l0-16m0 16-3-3m3 3 3-3" />
        </svg>
      );
    case "sliders":
      return (
        <svg {...common}>
          <path d="M4 6h10M20 6h-2M4 12h2M20 12H10M4 18h12M20 18h-2" />
          <circle cx="17" cy="6" r="2" />
          <circle cx="8" cy="12" r="2" />
          <circle cx="18" cy="18" r="2" />
        </svg>
      );
  }
}
