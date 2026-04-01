"use client";

import Image from "next/image";
import type { ReactNode } from "react";

type HeaderProps = {
  children?: ReactNode;
};

export function Header({ children }: HeaderProps) {
  return (
    <header className="pointer-events-none flex items-center justify-between px-6 py-4 bg-none absolute top-0 left-0 w-full z-10">
      <div className="pointer-events-auto flex items-center gap-3">
        <Image
          src="/logo.svg"
          alt="Workflow App logo"
          width={26}
          height={32}
          priority
          className="dark:invert"
        />
      </div>

      <div className="pointer-events-auto flex items-center gap-4">
        {children}
      </div>
    </header>
  );
}
