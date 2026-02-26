"use client";
import { useEffect, useState, ReactNode, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

interface AdminUser {
  id: string;
  username: string;
  role: string;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      let res = await fetch("/api/auth/verify");
      // If 401, try refresh
      if (res.status === 401) {
        const refreshRes = await fetch("/api/auth/refresh", { method: "POST" });
        if (refreshRes.ok) {
          res = await fetch("/api/auth/verify");
        }
      }
      if (!res.ok) {
        router.push("/admin/login");
        return;
      }
      const data = await res.json();
      setUser(data.user);
    } catch {
      router.push("/admin/login");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    checkAuth();
    // Auto-refresh token every 12 minutes (access token = 15m)
    const interval = setInterval(async () => {
      try {
        await fetch("/api/auth/refresh", { method: "POST" });
      } catch { /* silent */ }
    }, 12 * 60 * 1000);
    return () => clearInterval(interval);
  }, [checkAuth]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-4 border-[#c5a44e] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return null;

  const navItems: { href: string; label: string; icon: ReactNode }[] = [
    { href: "/admin/dashboard", label: "Dashboard", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="4" rx="1"/><rect x="14" y="11" width="7" height="10" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg> },
    { href: "/admin/dashboard/buildings", label: "Buildings", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18M5 21V7l8-4v18M13 21V3l6 4v14"/><path d="M9 9h1M9 13h1M15 9h1M15 13h1"/></svg> },
    { href: "/admin/dashboard/qr-codes", label: "QR Codes", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><path d="M21 14h-3v3h3M21 19v2h-2"/></svg> },
    { href: "/admin/dashboard/scanner", label: "QR Scanner", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7V4h3M20 7V4h-3M4 17v3h3M20 17v3h-3"/><line x1="4" y1="12" x2="20" y2="12"/></svg> },
    ...(user.role === "superadmin" || user.role === "admin"
      ? [{ href: "/admin/dashboard/audit", label: "Audit Log", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg> }]
      : []),
    ...(user.role === "superadmin"
      ? [{ href: "/admin/dashboard/users", label: "User Management", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg> }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 shadow-sm transform transition-transform lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 p-4 border-b border-gray-200">
          <Image
            src="/dubai-police-logo.png"
            alt="Logo"
            width={40}
            height={40}
            className="rounded-full"
          />
          <div>
            <h2 className="text-[#c5a44e] font-bold text-sm">Dubai Police</h2>
            <p className="text-gray-400 text-xs">Navigation Admin</p>
          </div>
        </div>

        <nav className="p-3 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
                pathname === item.href || pathname?.startsWith(item.href + "/")
                  ? "bg-[#c5a44e]/10 text-[#c5a44e] border border-[#c5a44e]/30"
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
              }`}
            >
              <span className="w-[18px] h-[18px] flex-shrink-0">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-900 text-sm font-medium">{user.username}</p>
              <p className="text-gray-400 text-xs capitalize">{user.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-gray-400 hover:text-red-500 transition-colors text-sm"
            >
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top Bar */}
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between lg:px-6 shadow-sm">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-gray-500 hover:text-gray-900"
          >
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
          <h1 className="text-gray-900 font-semibold">
            {navItems.find(
              (i) => pathname === i.href || pathname?.startsWith(i.href + "/")
            )?.label || "Admin"}
          </h1>
          <div className="text-gray-400 text-xs">
            Indoor Navigation System
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
