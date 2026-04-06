"use client";

import Image from "next/image";
import type { ReactNode } from "react";

type HeaderProps = {
  children?: ReactNode;
};

export function Header({ children }: HeaderProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <Image
          src="/logo.svg"
          alt="Workflow App logo"
          width={26}
          height={32}
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
