import { Button } from "@/components/ui/button";

interface QuickReplyChipsProps {
  suggestions: string[];
  onPick: (text: string) => void;
  testIdPrefix?: string;
}

export function QuickReplyChips({ suggestions, onPick, testIdPrefix = "quick-reply" }: QuickReplyChipsProps) {
  if (!suggestions.length) return null;
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-2 px-1 -mx-1 scrollbar-none"
      style={{ scrollbarWidth: "none" }}
      data-testid={`${testIdPrefix}-chips`}
    >
      {suggestions.map((s, i) => (
        <Button
          key={i}
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 rounded-full h-8 px-3 text-xs whitespace-nowrap bg-muted/40 hover:bg-muted"
          onClick={() => onPick(s)}
          data-testid={`${testIdPrefix}-${i}`}
        >
          {s}
        </Button>
      ))}
    </div>
  );
}
