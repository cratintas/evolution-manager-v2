import { cn } from "@/lib/utils";

const LOGO_SRC = "/assets/branding/logo-cra.png";

export function BrandLogo({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <img
      src={LOGO_SRC}
      alt=""
      aria-hidden="true"
      className={cn(
        "bg-transparent object-contain object-left",
        compact ? "h-8 w-auto max-w-[188px]" : "h-12 w-auto max-w-[280px]",
        className,
      )}
    />
  );
}


