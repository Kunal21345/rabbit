"use client";

import Image from "next/image";
import type { ReactNode } from "react";

type HeaderProps = {
  children?: ReactNode;
};

export function Header({ children }: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-4">
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

      <div className="flex items-center gap-4">
        {children}
      </div>
    </header>
  );
}
