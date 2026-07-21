import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowRight, Search, Sparkles, Target } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Target className="h-4 w-4" />
            </div>
            <span className="text-lg font-semibold tracking-tight">LeadForge</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/auth">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link to="/auth">
              <Button size="sm">Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-4xl px-6 pt-24 pb-16 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3 w-3" /> AI lead generation for agencies
          </div>
          <h1 className="text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">
            Find qualified prospects.<br />
            <span className="text-muted-foreground">Pitched, not spammed.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Enter a niche and location — "fencing companies in Austin, TX" — and LeadForge scrapes
            real businesses, extracts contacts, and drafts a personalized outreach angle for each one.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link to="/auth" search={{ next: undefined }}>

              <Button size="lg" className="gap-2">
                Start a campaign <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Search,
                title: "Scrape by niche & location",
                body: "Point LeadForge at any vertical — HVAC, roofing, dentists — in any city. It pulls real business data from the open web.",
              },
              {
                icon: Sparkles,
                title: "AI-drafted outreach",
                body: "Each lead comes with a 3-sentence brief on their pain points and 3 personalized cold-email opening lines.",
              },
              {
                icon: Target,
                title: "Track your pipeline",
                body: "Mark leads as interested, contacted, or not a fit. Export to CSV when you want to bring them into your CRM.",
              },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border border-border bg-card p-6">
                <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <f.icon className="h-4 w-4" />
                </div>
                <h3 className="mb-1 font-semibold tracking-tight">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        Built for agencies who care about their outbound.
      </footer>
    </div>
  );
}
