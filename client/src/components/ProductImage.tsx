import { useState, useEffect } from "react";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  iconClassName?: string;
  fallbackBg?: string;
  fallbackIconColor?: string;
  imgClassName?: string;
  testId?: string;
}

export function ProductImage({
  src,
  alt = "",
  className,
  iconClassName = "h-5 w-5",
  fallbackBg = "bg-muted",
  fallbackIconColor = "text-muted-foreground",
  imgClassName,
  testId,
}: ProductImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setErrored(false);
  }, [src]);

  const hasImage = !!src && !errored;

  return (
    <div
      className={cn("relative overflow-hidden shrink-0", className)}
      data-testid={testId}
    >
      {hasImage ? (
        <>
          {!loaded && (
            <div className="absolute inset-0 bg-muted animate-pulse" />
          )}
          <img
            src={src!}
            alt={alt}
            onLoad={() => setLoaded(true)}
            onError={() => setErrored(true)}
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-opacity duration-200",
              loaded ? "opacity-100" : "opacity-0",
              imgClassName,
            )}
          />
        </>
      ) : (
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center",
            fallbackBg,
          )}
        >
          <Package className={cn(fallbackIconColor, iconClassName)} />
        </div>
      )}
    </div>
  );
}
