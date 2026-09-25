import { useAuth } from "@/contexts/AuthContext";
import { ArrowRight, LogIn, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function SignIn() {
  const { user, profile, loading, isConfigured, signInWithGoogle } = useAuth();

  const handleSignIn = async () => {
    if (!isConfigured) {
      toast.error("Supabase is not configured yet.", { description: "Add the Supabase environment variables in Vercel first." });
      return;
    }

    try {
      await signInWithGoogle(`${window.location.origin}/account`);
    } catch (error) {
      toast.error("Google sign-in failed.", { description: error instanceof Error ? error.message : "Try again in a moment." });
    }
  };

  return (
    <section className="min-h-screen bg-[#0c0d0e] pt-[68px]">
      <div className="mx-auto grid min-h-[calc(100vh-68px)] max-w-[1440px] items-stretch px-4 py-8 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:px-9 lg:py-12">
        <div className="flex flex-col justify-between border-y border-white/15 py-8 lg:border-l lg:px-8">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#ff5a36]">Account access</p>
            <h1 className="mt-5 max-w-3xl font-display text-[clamp(5rem,12vw,12rem)] uppercase leading-[.68] tracking-[-.065em] text-white">Rider<br />sign in.</h1>
          </div>
          <p className="mt-8 max-w-md text-sm leading-7 text-white/45">Use Google to reserve orders, submit manual payment references, and track your build history from one account.</p>
        </div>

        <div className="flex items-center border-b border-white/15 py-8 lg:border-y lg:border-r lg:px-8">
          <div className="w-full border border-white/15 bg-[#111214] p-5 sm:p-7">
            {user ? (
              <>
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/50"><ShieldCheck size={14} className="text-[#ff5a36]" />Signed in</p>
                <h2 className="mt-5 font-display text-5xl uppercase leading-[.78] text-white">You are<br />already in.</h2>
                <p className="mt-4 text-sm leading-6 text-white/45">{profile?.full_name || user.email} is ready to use the account dashboard.</p>
                <Link href="/account" className="mt-7 inline-flex w-full items-center justify-center gap-2 bg-[#ff5a36] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-black transition hover:bg-white">
                  Open dashboard <ArrowRight size={15} />
                </Link>
              </>
            ) : (
              <>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/50">Google only</p>
                <h2 className="mt-5 font-display text-5xl uppercase leading-[.78] text-white">One secure<br />account path.</h2>
                <p className="mt-4 text-sm leading-6 text-white/45">No password forms here. Your account is created through Google and starts as a customer account.</p>
                <button onClick={handleSignIn} disabled={loading} className="mt-7 flex w-full items-center justify-center gap-2 bg-[#ff5a36] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-black transition hover:bg-white disabled:cursor-wait disabled:opacity-60">
                  <LogIn size={16} />
                  {loading ? "Checking session..." : "Continue with Google"}
                </button>
              </>
            )}
            <Link href="/shop" className="mt-4 inline-flex w-full items-center justify-center border border-white/15 px-5 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-white/60 transition hover:border-[#ff5a36] hover:text-[#ff5a36]">Back to shop</Link>
          </div>
        </div>
      </div>
    </section>
  );
}