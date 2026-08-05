import { Link } from "react-router-dom";
import { Card } from "../components/ui";
import { useI18n } from "../i18n";

// ---------------------------------------------------------------------------
// Informational guide: how onion bags are loaded for sale & export.
// Content reflects how onion facilities in the Nashik / Lasalgaon belt operate:
// farm → facility (tractor trolley) → truck (domestic) / container (export).
// ---------------------------------------------------------------------------

const vehicleTypes = [
  {
    key: "tractor",
    icon: "🚜",
    name: "Tractor Trolley",
    local: "Trolley / Gadi",
    role: "Farm → Facility (inward)",
    capacity: "3 – 6 tonnes",
    capacityQtl: "30 – 60 quintals",
    detail:
      "The first move — onions arrive from the farm in tractor trolleys, usually one or two loads a day per supplier. A single-axle trolley carries ~3 tonnes; a heavy double-axle hydraulic trolley takes up to 6 tonnes. Bags are hand-stacked 4–5 high and covered with tarpaulin for the road.",
    facts: [
      "Typical crew: 4–6 loaders per trolley",
      "Bagged at the farm gate in 25–50 kg mesh bags",
      "Weighed on the facility weighbridge before unloading",
      "Peak season: Nov–Apr, trolleys queue from early morning",
    ],
  },
  {
    key: "truck",
    icon: "🚛",
    name: "Truck",
    local: "Dala / Lorry",
    role: "Facility → Domestic Market (outward)",
    capacity: "16 – 28 tonnes",
    capacityQtl: "160 – 280 quintals",
    detail:
      "For domestic sales to APMC markets, metros and traders, bags go out by road. A 10-wheeler (16–18 t) carries ~170 quintals; a 12-wheeler heavy hauler (24–28 t) carries up to 280 quintals — roughly one full export container's worth. Destination matters: nearer mandis (Mumbai, Pune) usually take 10-wheelers, longer hauls use 12-wheelers.",
    facts: [
      "Loading: bags stacked on top of each other, tied with rope",
      "Weighbridge slip recorded before dispatch",
      "Typical destinations: Mumbai, Pune, Delhi, Hyderabad mandis",
      "One 12-wheeler ≈ one 40-ft export container",
    ],
  },
  {
    key: "container",
    icon: "🚢",
    name: "Export Container",
    local: "Khaandani / Container",
    role: "Facility → Port → Export (outward)",
    capacity: "12.5 – 28 tonnes",
    capacityQtl: "125 – 280 quintals",
    detail:
      "For export, bags are stuffed into ventilated dry containers (20-ft ≈ 12.5 t; 40-ft ≈ 25–28 t). Mesh bags are floor-loaded and interlocked so air can circulate — this is what keeps Nashik red onions alive through 20+ day sea transits to Bangladesh, Malaysia, UAE and Sri Lanka.",
    facts: [
      "20-ft container ≈ 125 quintals, 40-ft ≈ 280 quintals",
      "Ventilated (dry) containers — mesh bags for airflow",
      "Top grades (A/B, 40–70 mm) packed in 25/50 kg net bags",
      "Export docs: APEDA RCMC, phytosanitary certificate",
    ],
  },
];

const bagSizes = [
  { size: "10 kg", use: "Retail / UAE, GCC re-export packs", weight: "Small consumer net bag" },
  { size: "25 kg", use: "Most common export pack", weight: "Standard mesh/net bag" },
  { size: "50 kg", use: "Domestic mandi + export bulk", weight: "Heavy mesh/jute bag" },
  { size: "Jumbo (500 kg – 1 t)", use: "Institutional / processing buyers", weight: "Ventilated FIBC only" },
];

const loadingSteps = [
  {
    step: "1",
    title: "Sort & grade",
    text: "Onions are graded by size (40–70 mm is export grade) and variety before packing. Rotten or damaged bulbs are picked out — they spoil a whole bag in transit.",
  },
  {
    step: "2",
    title: "Bag & weigh",
    text: "Clean mesh/jute bags are filled to net weight (10/25/50 kg), stitched and weighed. Each bag is recorded against the toli that loaded it.",
  },
  {
    step: "3",
    title: "Stack & load",
    text: "Bags are hand-stacked onto the trolley/truck/container — interlocked so the pile holds on curves, leaving gaps for airflow on exports.",
  },
  {
    step: "4",
    title: "Record & dispatch",
    text: "Vehicle number, destination, bags and weight go on the dispatch slip (weighbridge ticket). The load leaves with a copy for the buyer.",
  },
];

const records = [
  { label: "Weighbridge slip", note: "Gross / tare / net weight per vehicle" },
  { label: "Vehicle number", note: "Trolley, truck or container registration" },
  { label: "Bag count & sizes", note: "How many 10/25/50 kg bags loaded" },
  { label: "Category & grade", note: "Red/white/rose, size grade (A/B/C)" },
  { label: "Destination & buyer", note: "Mandi name or port + buyer order no." },
  { label: "Loading toli", note: "Which toli gang loaded the vehicle" },
];

const localTerms = [
  { term: "Kanda", meaning: "Onion (Marathi)" },
  { term: "Dala", meaning: "Truck / lorry load" },
  { term: "Gadi / Trolley", meaning: "Tractor trolley" },
  { term: "Khaandani", meaning: "Export/container consignment" },
  { term: "Mandi", meaning: "Wholesale market (APMC yard)" },
  { term: "Kanda Chawl", meaning: "Ventilated onion storage shed" },
  { term: "Toli", meaning: "Worker gang / loading crew" },
  { term: "Dana / Bazaar rate", meaning: "Daily market price" },
];

export default function LoadingGuidePage() {
  const { t } = useI18n();
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="overflow-hidden rounded-2xl border border-field-200 bg-white shadow-sm">
        <div className="brand-gradient relative px-6 py-10 text-white sm:px-10">
          <div className="pointer-events-none absolute -right-10 -top-16 text-[180px] opacity-10">🚛</div>
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-onion-100 ring-1 ring-white/20">
            🧅 {t("Nashik · Lasalgaon onion belt")}
          </p>
          <h1 className="mt-4 max-w-2xl font-display text-3xl font-bold leading-tight sm:text-4xl">
            {t("Loading & Dispatch Guide")}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-onion-50/90 sm:text-base">
            {t("How onion bags move out of your facility — by tractor trolley, truck and export container — with the capacities, packing and paperwork the Nashik trade uses every day.")}
          </p>
        </div>

        {/* Quick stats strip */}
        <div className="grid grid-cols-2 divide-x divide-field-100 sm:grid-cols-4">
          {[
            { v: "30–60 qtl", l: "Tractor trolley" },
            { v: "160–280 qtl", l: "Truck (10/12-wheeler)" },
            { v: "280 qtl", l: "40-ft export container" },
            { v: "10/25/50 kg", l: "Standard bag sizes" },
          ].map((s) => (
            <div key={s.l} className="px-5 py-4 text-center">
              <p className="font-display text-lg font-bold text-onion-800">{s.v}</p>
              <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-field-400">{s.l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Vehicle cards */}
      <section>
        <h2 className="mb-4 font-display text-xl font-bold text-field-900">{t("How each vehicle loads")}</h2>
        <div className="grid gap-5 lg:grid-cols-3">
          {vehicleTypes.map((v) => (
            <Card key={v.key} className="flex flex-col">
              <div className="mb-3 flex items-start justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-onion-50 text-2xl ring-1 ring-onion-100">
                  {v.icon}
                </span>
                <span className="rounded-full bg-field-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-field-500">
                  {v.role}
                </span>
              </div>
              <h3 className="font-display text-lg font-bold text-field-900">{v.name}</h3>
              <p className="text-xs font-medium text-field-400">{v.local}</p>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-display text-2xl font-bold text-onion-700">{v.capacity}</span>
                <span className="text-xs font-medium text-field-400">{v.capacityQtl}</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-field-600">{v.detail}</p>
              <ul className="mt-4 space-y-2 border-t border-field-100 pt-3">
                {v.facts.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs leading-relaxed text-field-600">
                    <span className="mt-0.5 text-onion-600">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      {/* Bag sizes + loading steps */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t("Bag sizes used in the trade")} subtitle={t("Packing decides what fits on each vehicle")}>
          <div className="space-y-2.5">
            {bagSizes.map((b) => (
              <div key={b.size} className="flex items-center justify-between gap-3 rounded-lg bg-field-50 px-3.5 py-2.5">
                <div>
                  <p className="text-sm font-semibold text-field-900">{b.size}</p>
                  <p className="text-[11px] text-field-400">{b.use}</p>
                </div>
                <span className="text-right text-[11px] font-medium text-field-500">{b.weight}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-husk-200 bg-husk-50 px-3.5 py-2.5 text-xs leading-relaxed text-husk-800">
            💡 <strong>Ventilation is everything.</strong> Onions must breathe in transit —
            that's why mesh/jute bags (not airtight plastic) are used, and why exports
            use ventilated containers.
          </div>
        </Card>

        <Card title={t("The loading workflow")} subtitle={t("Four steps, from shed to vehicle")}>
          <ol className="space-y-4">
            {loadingSteps.map((s) => (
              <li key={s.step} className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-onion-700 font-display text-sm font-bold text-white">
                  {s.step}
                </span>
                <div>
                  <p className="text-sm font-semibold text-field-900">{s.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-field-600">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      {/* Records + local terms */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t("What to note down at dispatch")} subtitle={t("Paperwork Nashik facilities keep per load")}>
          <div className="grid gap-2 sm:grid-cols-2">
            {records.map((r) => (
              <div key={r.label} className="rounded-lg border border-field-100 bg-field-50/60 px-3.5 py-3">
                <p className="text-sm font-semibold text-field-900">{r.label}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-field-500">{r.note}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg bg-onion-50 px-3.5 py-2.5 text-xs leading-relaxed text-onion-800">
            Want to track dispatches in the app? The Work Entries screen already records
            bag category, size and quantity per toli — the building blocks of any load.
          </div>
        </Card>

        <Card title={t("Local terms you'll hear in Nashik")} subtitle={t("Kanda trade vocabulary")}>
          <div className="grid gap-2 sm:grid-cols-2">
            {localTerms.map((t) => (
              <div key={t.term} className="flex items-baseline justify-between gap-2 rounded-lg px-3.5 py-2.5">
                <span className="text-sm font-semibold text-field-900">{t.term}</span>
                <span className="text-right text-[11px] leading-snug text-field-500">{t.meaning}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 border-t border-field-100 pt-3 text-xs leading-relaxed text-field-500">
            🌶️ Lasalgaon APMC (near Nashik) is Asia's largest wholesale onion market and
            sets the national reference price. Maharashtra grows ~35% of India's onions,
            and Nashik red onions — deep red, pungent, long-keeping — are the export workhorse.
          </div>
        </Card>
      </div>

      {/* Footer links */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-field-200 bg-white px-6 py-4 shadow-sm">
        <p className="text-sm text-field-500">
          Loading data connects to your existing records — bag sizes, categories, quantities.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/reports"
            className="rounded-lg border border-onion-200 bg-white px-3.5 py-2 text-xs font-semibold text-onion-700 transition-colors hover:bg-onion-50"
          >
            Open Reports
          </Link>
          <Link
            to="../work-entries"
            className="rounded-lg bg-onion-700 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-onion-800"
          >
            Go to Work Entries
          </Link>
        </div>
      </div>
    </div>
  );
}
