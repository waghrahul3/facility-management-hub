import { and, eq, isNull } from "drizzle-orm";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { db, pool } from "./db/index.js";
import { runMigrations } from "./db/migrate.js";
import {
  bagSizes,
  companies,
  facilities,
  rates,
  supplierDrops,
  suppliers,
  toliLeaders,
  tolis,
  users,
  weeklyWorkSummaries,
  workEntries,
  subscriptionPlans,
} from "./db/schema.js";
import { hashPassword } from "./auth/password.js";
import { generateWeeklySummaries, processSupplierPayments } from "./services/payments.js";
import { endOfWeek, startOfWeek } from "./lib/date.js";
import { roundMoney } from "./lib/format.js";

const SUPER_ADMIN_EMAIL = "superadmin@onionfacility.local";
const FACILITY_ADMIN_EMAIL = "admin@onionfacility.local";
const DEFAULT_PASSWORD = "Onion@123";

/**
 * Idempotent demo seed. Safe to run on boot: skips anything that already
 * exists, and only seeds the demo week when there is no user data at all.
 */
export async function seedDatabase() {
  console.log("Running migrations...");
  await runMigrations();

  // -------------------------------------------------------------------------
  // 1. Super admin
  // -------------------------------------------------------------------------
  let superAdmin = (
    await db.select().from(users).where(eq(users.email, SUPER_ADMIN_EMAIL)).limit(1)
  )[0];
  if (!superAdmin) {
    [superAdmin] = await db
      .insert(users)
      .values({
        name: "Super Admin",
        email: SUPER_ADMIN_EMAIL,
        password_hash: await hashPassword(DEFAULT_PASSWORD),
        role: "SUPER_ADMIN",
      })
      .returning();
    console.log("Created super admin:", SUPER_ADMIN_EMAIL);
  }

  // -------------------------------------------------------------------------
  // 2. Company + Facility (a trading company owns the facility)
  // -------------------------------------------------------------------------
  let company = (
    await db.select().from(companies).where(eq(companies.name, "Latur Onion Traders")).limit(1)
  )[0];
  if (!company) {
    [company] = await db
      .insert(companies)
      .values({
        name: "Latur Onion Traders",
        contact_person: "Santosh Deshmukh",
        email: "santosh@laturonion.example",
        phone: "9876500099",
        address: "Market Yard, Latur",
        city: "Latur",
      })
      .returning();
    console.log("Created company:", company.name);
  }

  let companyAdmin = (
    await db
      .select()
      .from(users)
      .where(eq(users.email, "santosh@onionfacility.local"))
      .limit(1)
  )[0];
  if (!companyAdmin) {
    [companyAdmin] = await db
      .insert(users)
      .values({
        name: "Santosh Deshmukh",
        email: "santosh@onionfacility.local",
        phone: "9876500099",
        password_hash: await hashPassword(DEFAULT_PASSWORD),
        role: "COMPANY_ADMIN",
        company_id: company.id,
      })
      .returning();
    console.log("Created company admin: santosh@onionfacility.local");
  }

  let facility = (
    await db
      .select()
      .from(facilities)
      .where(eq(facilities.name, "Central Onion Storage & Grading Facility"))
      .limit(1)
  )[0];
  if (!facility) {
    [facility] = await db
      .insert(facilities)
      .values({
        company_id: company.id,
        name: "Central Onion Storage & Grading Facility",
        location: "Latur MIDC, Plot 12",
        city: "Latur",
        capacity: 200,
      })
      .returning();
    console.log("Created facility:", facility.name);
  } else if (!facility.company_id) {
    [facility] = await db
      .update(facilities)
      .set({ company_id: company.id, updated_at: new Date() })
      .where(eq(facilities.id, facility.id))
      .returning();
  }

  // -------------------------------------------------------------------------
  // 3. Facility admin
  // -------------------------------------------------------------------------
  let facilityAdmin = (
    await db.select().from(users).where(eq(users.email, FACILITY_ADMIN_EMAIL)).limit(1)
  )[0];
  if (!facilityAdmin) {
    [facilityAdmin] = await db
      .insert(users)
      .values({
        name: "Rajesh Patil",
        email: FACILITY_ADMIN_EMAIL,
        phone: "9876500001",
        password_hash: await hashPassword(DEFAULT_PASSWORD),
        role: "FACILITY_ADMIN",
        facility_id: facility.id,
      })
      .returning();
    console.log("Created facility admin:", FACILITY_ADMIN_EMAIL);
  }

  // -------------------------------------------------------------------------
  // 4. Supplier
  // -------------------------------------------------------------------------
  let supplier = (
    await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.name, "Rohidas Jadhav"))
      .limit(1)
  )[0];
  if (!supplier) {
    [supplier] = await db
      .insert(suppliers)
      .values({
        name: "Rohidas Jadhav",
        email: "rohidas@example.com",
        phone: "9876500002",
        contact_person: "Rohidas Jadhav",
        address: "Nanded Road, Latur",
        city: "Latur",
      })
      .returning();
    console.log("Created supplier:", supplier.name);
  }

  let supplierUser = (
    await db
      .select()
      .from(users)
      .where(and(eq(users.role, "SUPPLIER"), eq(users.supplier_id, supplier.id)))
      .limit(1)
  )[0];
  if (!supplierUser) {
    [supplierUser] = await db
      .insert(users)
      .values({
        name: supplier.name,
        email: "rohidas@onionfacility.local",
        phone: "9876500002",
        password_hash: await hashPassword(DEFAULT_PASSWORD),
        role: "SUPPLIER",
        supplier_id: supplier.id,
      })
      .returning();
    console.log("Created supplier user: rohidas@onionfacility.local");
  }

  // -------------------------------------------------------------------------
  // 5. Bag sizes + global rates
  // -------------------------------------------------------------------------
  const bagDefs = [
    { size_name: "1.5kg", weight_kg: 1.5, rate: 1.5 },
    { size_name: "Small", weight_kg: 5, rate: 50 },
    { size_name: "Medium", weight_kg: 10, rate: 75 },
    { size_name: "Large", weight_kg: 20, rate: 100 },
  ];
  for (const def of bagDefs) {
    let bag = (
      await db
        .select()
        .from(bagSizes)
        .where(eq(bagSizes.size_name, def.size_name))
        .limit(1)
    )[0];
    if (!bag) {
      [bag] = await db
        .insert(bagSizes)
        .values({
          size_name: def.size_name,
          weight_kg: def.weight_kg,
          is_global: true,
          created_by: superAdmin.id,
        })
        .returning();
      console.log("Created bag size:", def.size_name);
    }
    const globalRate = (
      await db
        .select()
        .from(rates)
        .where(and(eq(rates.bag_size_id, bag.id), isNull(rates.facility_id)))
        .limit(1)
    )[0];
    if (!globalRate) {
      await db.insert(rates).values({
        bag_size_id: bag.id,
        facility_id: null,
        rate_amount: def.rate,
        is_global: true,
        created_by: superAdmin.id,
      });
      console.log("Created global rate:", def.size_name, "=", def.rate);
    }
  }


  // -------------------------------------------------------------------------
  // 5b. Subscription plans (all billing cycles)
  // -------------------------------------------------------------------------
  const planDefs = [
    { name: "Company Monthly", type: "COMPANY", price: 500, billing_cycle: "monthly", description: "Includes 1 facility admin; additional facilities ₹500/mo each" },
    { name: "Company Quarterly", type: "COMPANY", price: 1350, billing_cycle: "quarterly", description: "3 months of Company plan — save ₹150" },
    { name: "Company Half-Yearly", type: "COMPANY", price: 2500, billing_cycle: "half-yearly", description: "6 months of Company plan — save ₹500" },
    { name: "Company Yearly", type: "COMPANY", price: 4500, billing_cycle: "yearly", description: "12 months of Company plan — save ₹1500" },
    { name: "Supplier Monthly", type: "SUPPLIER", price: 300, billing_cycle: "monthly", description: "Monthly supplier subscription" },
    { name: "Supplier Quarterly", type: "SUPPLIER", price: 810, billing_cycle: "quarterly", description: "3 months of Supplier plan — save ₹90" },
    { name: "Supplier Half-Yearly", type: "SUPPLIER", price: 1500, billing_cycle: "half-yearly", description: "6 months of Supplier plan — save ₹300" },
    { name: "Supplier Yearly", type: "SUPPLIER", price: 2700, billing_cycle: "yearly", description: "12 months of Supplier plan — save ₹900" },
  ] as const;
  for (const def of planDefs) {
    const existing = (
      await db
        .select()
        .from(subscriptionPlans)
        .where(and(eq(subscriptionPlans.name, def.name), eq(subscriptionPlans.type, def.type)))
        .limit(1)
    )[0];
    if (!existing) {
      await db.insert(subscriptionPlans).values({
        name: def.name,
        type: def.type,
        price: def.price,
        billing_cycle: def.billing_cycle,
        description: def.description,
        is_active: true,
      });
      console.log("Created subscription plan:", def.name);
    }
  }

  // -------------------------------------------------------------------------
  // 6. Demo toli leader + toli (this week) — with a supplier drop
  // -------------------------------------------------------------------------
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const weekStart = startOfWeek(today);
  const weekEnd = endOfWeek(today);

  const smallBag = (
    await db
      .select()
      .from(bagSizes)
      .where(eq(bagSizes.size_name, "Small"))
      .limit(1)
  )[0];
  const mediumBag = (
    await db
      .select()
      .from(bagSizes)
      .where(eq(bagSizes.size_name, "Medium"))
      .limit(1)
  )[0];

  let leader = (
    await db
      .select()
      .from(toliLeaders)
      .where(eq(toliLeaders.name, "Mahesh Kale"))
      .limit(1)
  )[0];
  if (!leader) {
    [leader] = await db
      .insert(toliLeaders)
      .values({ name: "Mahesh Kale", phone: "9876500003" })
      .returning();
    console.log("Created toli leader: Mahesh Kale");
  }

  // A drop within the current week (a couple of days ago, clamped to Monday)
  const dropDate = new Date(today);
  dropDate.setDate(dropDate.getDate() - 2);
  if (dropDate < weekStart) dropDate.setTime(weekStart.getTime());
  let drop = (
    await db
      .select()
      .from(supplierDrops)
      .where(and(eq(supplierDrops.supplier_id, supplier.id), eq(supplierDrops.drop_date, dropDate)))
      .limit(1)
  )[0];
  if (!drop) {
    [drop] = await db
      .insert(supplierDrops)
      .values({
        supplier_id: supplier.id,
        facility_id: facility.id,
        drop_date: dropDate,
        total_workers_dropped: 8,
        rent_per_drop: 700,
      })
      .returning();
    console.log("Created supplier drop with rent ₹700");
  }

  let toli = (
    await db
      .select()
      .from(tolis)
      .where(and(eq(tolis.leader_name, "Mahesh Kale"), eq(tolis.facility_id, facility.id)))
      .limit(1)
  )[0];
  if (!toli) {
    [toli] = await db
      .insert(tolis)
      .values({
        facility_id: facility.id,
        leader_id: leader.id,
        leader_name: leader.name,
        worker_count: 8,
        daily_charge: 1000,
        date: dropDate,
        drop_id: drop.id,
      })
      .returning();
    console.log("Created toli: Mahesh Kale (8 workers, ₹1000/day)");
  }

  // Link toli leader user account
  let leaderUser = (
    await db
      .select()
      .from(users)
      .where(and(eq(users.role, "TOLI_LEADER"), eq(users.toli_id, toli.id)))
      .limit(1)
  )[0];
  if (!leaderUser) {
    await db.insert(users).values({
      name: leader.name,
      email: "mahesh@onionfacility.local",
      phone: "9876500003",
      password_hash: await hashPassword(DEFAULT_PASSWORD),
      role: "TOLI_LEADER",
      toli_id: toli.id,
    });
    console.log("Created toli leader user: mahesh@onionfacility.local");
  }

  // Sample work entries this week (a few days, clamped inside the current week)
  const smallRate = (
    await db
      .select()
      .from(rates)
      .where(and(eq(rates.bag_size_id, smallBag.id), isNull(rates.facility_id)))
      .limit(1)
  )[0];
  const mediumRate = (
    await db
      .select()
      .from(rates)
      .where(and(eq(rates.bag_size_id, mediumBag.id), isNull(rates.facility_id)))
      .limit(1)
  )[0];

  for (let daysAgo = 2; daysAgo >= 0; daysAgo--) {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    if (d < weekStart) continue; // keep demo data inside the current Monday–Sunday week
    const existing = (
      await db
        .select()
        .from(workEntries)
        .where(
          and(
            eq(workEntries.toli_id, toli.id),
            eq(workEntries.work_date, d)
          )
        )
        .limit(1)
    )[0];
    if (!existing && smallRate && mediumRate) {
      const qty = 10 + daysAgo * 2;
      await db.insert(workEntries).values({
        toli_id: toli.id,
        facility_id: facility.id,
        work_date: d,
        bag_size_id: smallBag.id,
        quantity_bags: qty,
        rate_per_bag: smallRate.rate_amount,
        total_amount: roundMoney(smallRate.rate_amount * qty),
        status: "APPROVED",
        leader_confirmed_at: new Date(),
      });
      await db.insert(workEntries).values({
        toli_id: toli.id,
        facility_id: facility.id,
        work_date: d,
        bag_size_id: mediumBag.id,
        quantity_bags: Math.max(3, qty - 4),
        rate_per_bag: mediumRate.rate_amount,
        total_amount: roundMoney(mediumRate.rate_amount * Math.max(3, qty - 4)),
        status: "APPROVED",
        leader_confirmed_at: new Date(),
      });
      console.log("Seeded work entries for", d.toISOString().slice(0, 10));
    }
  }

  // -------------------------------------------------------------------------
  // 7. Demo week: generate + approve summaries, then a pending Sunday payment
  // -------------------------------------------------------------------------
  const summaries = await generateWeeklySummaries(facility.id, weekStart, weekEnd);
  if (summaries.length > 0) {
    await db
      .update(weeklyWorkSummaries)
      .set({ approval_status: "APPROVED", approved_at: new Date() })
      .where(
        and(
          eq(weeklyWorkSummaries.facility_id, facility.id),
          eq(weeklyWorkSummaries.week_start_date, weekStart)
        )
      );
    const payments = await processSupplierPayments(facility.id, weekStart, weekEnd);
    console.log(`Seeded ${payments.length} pending supplier payment(s) for the current week.`);
  }

  console.log("\n✅ Seed complete. Demo logins (password: Onion@123):");
  console.log("  Super Admin:    superadmin@onionfacility.local");
  console.log("  Company Admin:  santosh@onionfacility.local");
  console.log("  Facility Admin: admin@onionfacility.local");
  console.log("  Supplier:       rohidas@onionfacility.local");
  console.log("  Toli Leader:    mahesh@onionfacility.local");
}

// Allow running directly: `npm run seed`
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  seedDatabase()
    .then(() => pool.end())
    .catch(async (err) => {
      console.error("Seed failed:", err);
      await pool.end();
      process.exit(1);
    });
}
