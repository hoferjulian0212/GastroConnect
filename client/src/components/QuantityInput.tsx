import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Minus, Plus } from "lucide-react";

interface QuantityInputProps {
  value: number;
  onChange: (newValue: number) => void;
  min?: number;
  disabled?: boolean;
  size?: "sm" | "md";
  testIdPrefix?: string;
}

export default function QuantityInput({
  value,
  onChange,
  min = 1,
  disabled = false,
  size = "md",
  testIdPrefix = "qty",
}: QuantityInputProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitEdit = () => {
    const parsed = parseInt(editValue, 10);
    if (!isNaN(parsed) && parsed >= min) {
      onChange(parsed);
    } else if (!isNaN(parsed) && parsed < min) {
      onChange(min);
    }
    setEditing(false);
  };

  const btnSize = size === "sm" ? "h-6 w-6" : "h-8 w-8";
  const iconSize = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";
  const textSize = size === "sm" ? "text-xs" : "text-sm";
  const inputWidth = size === "sm" ? "w-8" : "w-10";
  const displayWidth = size === "sm" ? "w-6" : "w-8";

  return (
    <div className="flex items-center border border-border rounded-md">
      <Button
        variant="ghost"
        size="icon"
        className={btnSize}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        data-testid={`${testIdPrefix}-decrease`}
      >
        <Minus className={iconSize} />
      </Button>
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") setEditing(false);
          }}
          min={min}
          className={`${inputWidth} ${textSize} text-center bg-transparent outline-none border-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
          data-testid={`${testIdPrefix}-input`}
        />
      ) : (
        <span
          className={`${displayWidth} text-center ${textSize} cursor-text tabular-nums select-none`}
          onClick={() => {
            if (!disabled) {
              setEditValue(String(value));
              setEditing(true);
            }
          }}
          data-testid={`${testIdPrefix}-value`}
        >
          {value}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon"
        className={btnSize}
        onClick={() => onChange(value + 1)}
        disabled={disabled}
        data-testid={`${testIdPrefix}-increase`}
      >
        <Plus className={iconSize} />
      </Button>
    </div>
  );
}
