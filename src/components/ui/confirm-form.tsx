"use client";

import { Button } from "./button";

/**
 * A tiny form that asks for confirmation before running a server action.
 * Use for deletes and other destructive one-click actions.
 */
export function ConfirmForm({
  action,
  message = "Are you sure?",
  children,
  variant = "danger",
  size = "sm",
  className,
  hidden,
}: {
  action: (formData: FormData) => void | Promise<void>;
  message?: string;
  children: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  hidden?: Record<string, string>;
}) {
  return (
    <form
      action={action}
      className={className}
      onSubmit={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {hidden
        ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)
        : null}
      <Button type="submit" variant={variant} size={size}>
        {children}
      </Button>
    </form>
  );
}
