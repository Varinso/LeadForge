import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  format,
  isSameMonth,
  isSameDay,
  parseISO,
} from "date-fns";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Phone, CalendarClock, Mail, Loader2 } from "lucide-react";
import { listCalendarEvents } from "@/lib/calls.functions";

export const Route = createFileRoute("/_authenticated/calendar")({
  component: CalendarPage,
  head: () => ({
    meta: [
      { title: "Calendar — LeadForge" },
      { name: "description", content: "Follow-ups, calls made, and email replies in one calendar view." },
      { property: "og:title", content: "Calendar — LeadForge" },
      { property: "og:description", content: "Track follow-ups, call activity, and replies." },
    ],
  }),
});

type Event = {
  id: string;
  kind: "call" | "follow_up" | "reply";
  at: string;
  lead_id: string;
  lead_name: string;
  campaign_id: string;
  title: string;
  detail: string | null;
};

const KIND_STYLE: Record<Event["kind"], { bg: string; icon: typeof Phone; label: string }> = {
  call: { bg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", icon: Phone, label: "Call" },
  follow_up: { bg: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", icon: CalendarClock, label: "Follow-up" },
  reply: { bg: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300", icon: Mail, label: "Reply" },
};

function CalendarPage() {
  const fetchEvents = useServerFn(listCalendarEvents);
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const range = useMemo(() => {
    const from = startOfWeek(startOfMonth(cursor));
    const to = endOfWeek(endOfMonth(cursor));
    return { from, to };
  }, [cursor]);

  const q = useQuery({
    queryKey: ["calendar-events", range.from.toISOString(), range.to.toISOString()],
    queryFn: () =>
      fetchEvents({ data: { from: range.from.toISOString(), to: range.to.toISOString() } }),
  });

  const events = (q.data ?? []) as Event[];
  const eventsByDay = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const e of events) {
      const key = format(parseISO(e.at), "yyyy-MM-dd");
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [events]);

  const days = useMemo(() => {
    const out: Date[] = [];
    let d = range.from;
    while (d <= range.to) {
      out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }, [range]);

  const selectedEvents = selectedDay
    ? eventsByDay.get(format(selectedDay, "yyyy-MM-dd")) ?? []
    : [];

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl p-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Follow-ups, calls made, and email replies across all campaigns.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setCursor((c) => subMonths(c, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-40 text-center text-sm font-medium">
              {format(cursor, "MMMM yyyy")}
            </div>
            <Button variant="outline" size="icon" onClick={() => setCursor((c) => addMonths(c, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
              Today
            </Button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {(["call", "follow_up", "reply"] as const).map((k) => {
            const s = KIND_STYLE[k];
            const Icon = s.icon;
            return (
              <span key={k} className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ${s.bg}`}>
                <Icon className="h-3 w-3" /> {s.label}
              </span>
            );
          })}
          {q.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        </div>

        <div className="grid grid-cols-[1fr_320px] gap-6">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="grid grid-cols-7 border-b border-border bg-muted/40 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="px-2 py-2 text-center">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const dayEvents = eventsByDay.get(key) ?? [];
                const inMonth = isSameMonth(day, cursor);
                const today = isSameDay(day, new Date());
                const selected = selectedDay && isSameDay(day, selectedDay);
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedDay(day)}
                    className={`min-h-24 border-b border-r border-border p-2 text-left transition-colors hover:bg-muted/40 ${
                      !inMonth ? "bg-muted/10 text-muted-foreground" : ""
                    } ${selected ? "ring-2 ring-inset ring-primary" : ""}`}
                  >
                    <div className={`mb-1 text-xs font-medium ${today ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground" : ""}`}>
                      {format(day, "d")}
                    </div>
                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map((e) => {
                        const s = KIND_STYLE[e.kind];
                        const Icon = s.icon;
                        return (
                          <div key={e.id} className={`flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[11px] ${s.bg}`}>
                            <Icon className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{e.lead_name}</span>
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <div className="text-[11px] text-muted-foreground">+{dayEvents.length - 3} more</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold">
              {selectedDay ? format(selectedDay, "EEEE, MMM d") : "Select a day"}
            </h3>
            {!selectedDay && (
              <p className="text-xs text-muted-foreground">Click a day to see all events.</p>
            )}
            {selectedDay && selectedEvents.length === 0 && (
              <p className="text-xs text-muted-foreground">No events on this day.</p>
            )}
            <ul className="space-y-2">
              {selectedEvents.map((e) => {
                const s = KIND_STYLE[e.kind];
                const Icon = s.icon;
                return (
                  <li key={e.id} className="rounded-md border border-border p-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${s.bg}`}>
                        <Icon className="h-3 w-3" /> {s.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(parseISO(e.at), "p")}
                      </span>
                    </div>
                    <div className="text-sm font-medium">{e.lead_name}</div>
                    {e.detail && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{e.detail}</p>
                    )}
                    {e.campaign_id && (
                      <Link
                        to="/campaigns/$id"
                        params={{ id: e.campaign_id }}
                        className="mt-2 inline-block text-xs text-primary hover:underline"
                      >
                        Open campaign →
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
