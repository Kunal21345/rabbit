"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type HeaderProps = {
  children?: ReactNode;
  className?: string;
};

export function Header({ children, className }: HeaderProps) {
  return (
    <header
      className={cn(
        "flex h-16 items-center justify-between px-4 py-1 sm:px-6",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <Image
          src="/logo.svg"
          alt="Workflow App logo"
          width={20}
          height={26}
          priority
          className="dark:invert"
        />
      </div>

      <div className="flex items-center gap-3">
        {children}
      </div>
    </header>
  );
}
