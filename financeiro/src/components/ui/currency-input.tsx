"use client";

import {
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { Input } from "@/components/ui/input";

function formatCurrencyValue(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";

  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizeCurrencyDigits(value: string): string {
  return value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

function formatCurrencyDigits(digits: string): string {
  return formatCurrencyValue(Number(normalizeCurrencyDigits(digits)));
}

function isEntireInputSelected(input: HTMLInputElement): boolean {
  return input.selectionStart === 0 && input.selectionEnd === input.value.length;
}

export function currencyValueToDigits(value: number | null | undefined): string {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return String(Math.round(amount));
}

export function parseCurrencyDigits(digits: string): number {
  const amount = Number(digits);
  return Number.isFinite(amount) ? amount : 0;
}

type CurrencyInputProps = {
  id: string;
  digits: string;
  onDigitsChange: (value: string | ((current: string) => string)) => void;
};

export function CurrencyInput({ id, digits, onDigitsChange }: CurrencyInputProps) {
  const setNormalizedDigits = (next: string | ((current: string) => string)) => {
    onDigitsChange((current) => normalizeCurrencyDigits(typeof next === "function" ? next(current) : next));
  };

  const appendDigit = (digit: string, replaceCurrent: boolean) => {
    setNormalizedDigits((current) => (replaceCurrent ? digit : `${current}${digit}`));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      appendDigit(event.key, isEntireInputSelected(event.currentTarget));
      return;
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      if (isEntireInputSelected(event.currentTarget)) {
        onDigitsChange("");
      } else {
        setNormalizedDigits((current) => current.slice(0, -1));
      }
      return;
    }

    if (event.key === "Delete") {
      event.preventDefault();
      onDigitsChange("");
      return;
    }

    if (!["Tab", "ArrowLeft", "ArrowRight", "Home", "End", "Enter", "Escape"].includes(event.key)) {
      event.preventDefault();
    }
  };

  const handleBeforeInput = (event: FormEvent<HTMLInputElement>) => {
    const nativeEvent = event.nativeEvent as InputEvent;
    const data = nativeEvent.data || "";
    if (nativeEvent.inputType === "insertText" && /^\d$/.test(data)) {
      event.preventDefault();
      appendDigit(data, isEntireInputSelected(event.currentTarget));
    }
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nativeEvent = event.nativeEvent as InputEvent;
    const data = nativeEvent.data || "";

    if (nativeEvent.inputType === "insertText" && /^\d$/.test(data)) {
      appendDigit(data, isEntireInputSelected(event.currentTarget));
      return;
    }

    if (nativeEvent.inputType === "deleteContentBackward") {
      setNormalizedDigits((current) => current.slice(0, -1));
      return;
    }

    setNormalizedDigits(event.target.value);
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pastedDigits = normalizeCurrencyDigits(event.clipboardData.getData("text"));
    if (!pastedDigits) return;
    setNormalizedDigits((current) =>
      isEntireInputSelected(event.currentTarget) ? pastedDigits : `${current}${pastedDigits}`,
    );
  };

  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      value={formatCurrencyDigits(digits)}
      onBeforeInput={handleBeforeInput}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onFocus={(event) => event.currentTarget.select()}
      placeholder="R$ 0,00"
    />
  );
}
