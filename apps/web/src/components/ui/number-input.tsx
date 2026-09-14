import * as React from "react"
import { Input } from "./input"

export interface NumberInputProps extends Omit<React.ComponentProps<"input">, "type"> {
  allowDecimals?: boolean;
}

const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ className, allowDecimals = false, onKeyDown, onPaste, ...props }, ref) => {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Permitir teclas de control: Backspace, Tab, Enter, Escape, Flechas, etc.
      const allowedKeys = [
        "Backspace", "Tab", "Enter", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Delete", "Home", "End"
      ];
      
      // Permitir atajos (Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X)
      if (e.ctrlKey || e.metaKey) return;

      if (allowedKeys.includes(e.key)) return;

      // Permitir punto decimal si está configurado y no hay uno ya
      if (allowDecimals && (e.key === '.' || e.key === ',')) {
        const currentValue = e.currentTarget.value;
        if (currentValue.includes('.') || currentValue.includes(',')) {
          e.preventDefault();
        }
        return;
      }

      // Prevenir si no es número
      if (!/^[0-9]$/.test(e.key)) {
        e.preventDefault();
      }

      if (onKeyDown) onKeyDown(e);
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pastedText = e.clipboardData.getData('text');
      const regex = allowDecimals ? /^[0-9.,]+$/ : /^[0-9]+$/;
      
      if (!regex.test(pastedText)) {
        e.preventDefault();
      }

      if (onPaste) onPaste(e);
    };

    return (
      <Input
        type="text" // Usamos text en lugar de number para tener control absoluto de los eventos de teclado sin la ruleta nativa
        className={className}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        ref={ref}
        {...props}
      />
    )
  }
)
NumberInput.displayName = "NumberInput"

export { NumberInput }
