import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function baseProps(size: number, props: IconProps) {
  const { size: _s, ...rest } = props;
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...rest,
  };
}

export function TreeIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <circle cx="12" cy="5" r="2.5" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
      <path d="M12 7.5v4.5M5.5 16v-2a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export function SearchIcon({ size = 15, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function ZoomInIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5M11 8v6M8 11h6" />
    </svg>
  );
}

export function ZoomOutIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5M8 11h6" />
    </svg>
  );
}

export function FitIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" />
    </svg>
  );
}

export function CrosshairIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SlidersIcon({ size = 15, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M4 7h10M18 7h2M4 12h4M12 12h8M4 17h12M20 17h0" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="17" r="2" />
    </svg>
  );
}

export function LinkUsersIcon({ size = 15, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <circle cx="7" cy="8" r="3" />
      <circle cx="17" cy="8" r="3" />
      <path d="M2 19c0-2.8 2.2-5 5-5s5 2.2 5 5M12 19c0-2.8 2.2-5 5-5s5 2.2 5 5" />
    </svg>
  );
}

export function UploadIcon({ size = 15, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

export function DownloadIcon({ size = 15, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M12 4v12m0 0-4-4m4 4 4-4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

export function PrinterIcon({ size = 15, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M6 9V4h12v5M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="6" rx="1" />
    </svg>
  );
}

export function SunIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

export function MoonIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

export function CloseIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function CameraIcon({ size = 13, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M4 8h3l1.5-2h7L17 8h3a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 20H4a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 4 8Z" />
      <circle cx="12" cy="13.5" r="3" />
    </svg>
  );
}

export function SparklesIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M12 3l1.6 4.8L18.5 9.5l-4.9 1.7L12 16l-1.6-4.8-4.9-1.7 4.9-1.7L12 3Z" />
    </svg>
  );
}

export function BookOpenIcon({ size = 15, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z" />
      <path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

export function TrashIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  );
}
