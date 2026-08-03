interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className = "h-7 w-7" }: BrandMarkProps) {
  return (
    <span
      className={`brand-mark inline-block shrink-0 ${className}`}
      aria-hidden="true"
    />
  );
}
