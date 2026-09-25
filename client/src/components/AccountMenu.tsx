import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { LogIn, LogOut, ShieldCheck, User } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

function initials(name?: string | null, email?: string | null) {
  const source = name || email || "Rider";
  return source
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function AccountMenu() {
  const { user, profile, signOut } = useAuth();
  const displayName = profile?.full_name || user?.email || "Rider";

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      toast.error("Sign-out failed.", { description: error instanceof Error ? error.message : "Try again in a moment." });
    }
  };

  if (!user) {
    return (
      <Link href="/sign-in" className="flex h-9 items-center gap-2 border border-white/15 px-3 text-[10px] font-black uppercase tracking-[0.14em] text-white/85 transition hover:border-[#ff5a36] hover:text-[#ff5a36]" aria-label="Open sign in screen">
        <LogIn size={15} />
        <span className="hidden sm:inline">Sign in</span>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="grid size-9 place-items-center border border-white/15 text-white transition hover:border-[#ff5a36]" aria-label="Open account menu">
          <Avatar className="size-7 rounded-none">
            <AvatarImage src={profile?.avatar_url ?? undefined} alt="" />
            <AvatarFallback className="rounded-none bg-[#ff5a36] text-[10px] font-black text-black">{initials(profile?.full_name, user.email)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-none border-white/15 bg-[#151719] p-2 text-white shadow-2xl">
        <DropdownMenuLabel className="px-2 py-2">
          <span className="block truncate text-xs font-bold text-white">{displayName}</span>
          <span className="mt-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/45">
            <ShieldCheck size={12} className="text-[#ff5a36]" />
            {profile?.role ?? "customer"}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-white/10" />
        <DropdownMenuItem asChild className="rounded-none text-xs text-white/70 focus:bg-[#ff5a36] focus:text-black">
          <Link href="/account"><User size={14} />Account dashboard</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleSignOut} className="rounded-none text-xs text-white/70 focus:bg-[#ff5a36] focus:text-black">
          <LogOut size={14} />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}