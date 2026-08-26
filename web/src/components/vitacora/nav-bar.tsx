"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function NavBar() {
  const router = useRouter();

  async function handleLogout(): Promise<void> {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex items-center justify-between border-b px-4 py-3">
      <Link href="/" className="font-semibold">
        Vitácora
      </Link>
      <div className="flex items-center gap-2">
        <Link href="/settings" className="text-muted-foreground text-sm hover:text-foreground">
          Configuración
        </Link>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          Salir
        </Button>
      </div>
    </header>
  );
}
