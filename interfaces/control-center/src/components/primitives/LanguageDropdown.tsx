"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

type LanguageValue = "en" | "ru";

type LanguageOption = {
  value: LanguageValue;
  label: string;
  disabled?: boolean;
};

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: "en", label: "English" },
  { value: "ru", label: "Russian", disabled: true },
];

export function LanguageDropdown({
  id,
  ariaLabel,
  defaultValue = "en",
}: {
  id: string;
  ariaLabel: string;
  defaultValue?: LanguageValue;
}) {
  const generatedId = useId();
  const menuId = `${id || generatedId}-menu`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<LanguageValue>(defaultValue);
  const selected = LANGUAGE_OPTIONS.find((option) => option.value === value) || LANGUAGE_OPTIONS[0];

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function choose(option: LanguageOption) {
    if (option.disabled) return;
    setValue(option.value);
    setOpen(false);
  }

  return (
    <div className="language-dropdown" ref={rootRef}>
      <button
        id={id}
        className="control-select language-dropdown-button"
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected.label}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open ? (
        <div className="language-dropdown-menu" id={menuId} role="listbox" aria-label={ariaLabel}>
          {LANGUAGE_OPTIONS.map((option) => {
            const active = option.value === value;
            return (
              <button
                className={`language-dropdown-option ${active ? "active" : ""}`}
                type="button"
                role="option"
                aria-selected={active}
                aria-disabled={option.disabled || undefined}
                disabled={option.disabled}
                onClick={() => choose(option)}
                key={option.value}
              >
                <span className="language-option-check">{active ? <Check size={17} /> : null}</span>
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
