/**
 * Creates demo Auth users via Supabase Auth API (reliable).
 * Then promotes roles + seeds business data once tables exist.
 *
 * Usage:
 *   node scripts/bootstrap-demo.mjs
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
 * Requires schema already applied (tables + RLS + trigger).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) throw new Error("Missing .env.local");
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

const DEMO_USERS = [
  { email: "admin@gcmanager.demo", password: "Demo123!", full_name: "Demo Admin", role: "admin" },
  { email: "pm@gcmanager.demo", password: "Demo123!", full_name: "Demo Project Manager", role: "project_manager" },
  { email: "client@gcmanager.demo", password: "Demo123!", full_name: "Demo Client", role: "client" },
  { email: "field@gcmanager.demo", password: "Demo123!", full_name: "Demo Field Supervisor", role: "field_supervisor" },
  { email: "sub@gcmanager.demo", password: "Demo123!", full_name: "Demo Subcontractor", role: "subcontractor" },
];

const CONTRACT_IDS = [
  "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
  "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
  "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3",
  "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4",
  "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5",
  "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6",
  "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7",
  "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8",
];

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function ensureUser(supabase, { email, password, full_name }) {
  // Try login first
  const login = await supabase.auth.signInWithPassword({ email, password });
  if (login.data?.user) {
    console.log(`  ✓ exists/login: ${email}`);
    return login.data.user;
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name } },
  });
  if (error) {
    // User may exist with different password
    console.log(`  ✗ signup ${email}: ${error.message}`);
    throw error;
  }
  console.log(`  ✓ created: ${email}`);
  // Sign in to get a session
  const again = await supabase.auth.signInWithPassword({ email, password });
  if (again.error) throw again.error;
  return again.data.user;
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or ANON_KEY");

  const supabase = createClient(url, key);

  console.log("1) Creating / verifying demo Auth users...");
  const users = {};
  for (const demo of DEMO_USERS) {
    users[demo.role === "project_manager" ? "pm" : demo.role] = {
      ...demo,
      user: await ensureUser(supabase, demo),
    };
  }

  // Check tables
  const { error: tableErr } = await supabase.from("contracts").select("id").limit(1);
  if (tableErr) {
    console.error("\nSchema not applied yet:", tableErr.message);
    console.error("Run supabase/SCHEMA_ONLY.sql in the Supabase SQL Editor, then re-run this script.");
    process.exit(2);
  }

  console.log("\n2) Promoting roles (using each user's own session)...");
  for (const demo of DEMO_USERS) {
    const keyName = demo.role === "project_manager" ? "pm" : demo.role;
    const client = createClient(url, key);
    const { error: loginErr } = await client.auth.signInWithPassword({
      email: demo.email,
      password: demo.password,
    });
    if (loginErr) throw loginErr;

    // Ensure profile row exists, then set role
    const uid = users[keyName].user.id;
    await client.from("user_profiles").upsert({
      id: uid,
      email: demo.email,
      full_name: demo.full_name,
      role: demo.role,
    });
    const { error: roleErr } = await client
      .from("user_profiles")
      .update({ role: demo.role, full_name: demo.full_name, email: demo.email })
      .eq("id", uid);
    if (roleErr) console.log(`  role update ${demo.email}: ${roleErr.message}`);
    else console.log(`  ✓ role ${demo.role}: ${demo.email}`);
  }

  // Seed as project manager (contracts_insert requires user_id = auth.uid())
  console.log("\n3) Seeding business data as project manager...");
  const seeder = createClient(url, key);
  const { error: seederLoginErr } = await seeder.auth.signInWithPassword({
    email: "pm@gcmanager.demo",
    password: "Demo123!",
  });
  if (seederLoginErr) throw seederLoginErr;

  const adminId = users.admin.user.id;
  const pmId = users.pm.user.id;
  const clientId = users.client.user.id;
  const fieldId = users.field_supervisor.user.id;
  const subId = users.subcontractor.user.id;

  // Clear prior demo contracts (cascade) — admin can select all; delete may need PM ownership
  // Prefer delete via PM for owned rows; also try admin session for cleanup.
  const adminClient = createClient(url, key);
  await adminClient.auth.signInWithPassword({
    email: "admin@gcmanager.demo",
    password: "Demo123!",
  });
  // No DELETE policy on contracts — skip delete if it fails; use upsert-ish by deleting children first won't work.
  // Insert with fixed IDs: if conflict, update isn't allowed. So delete via SQL-less approach:
  // Try RPC-free: only insert if empty.
  const { data: existing } = await seeder.from("contracts").select("id").in("id", CONTRACT_IDS);
  const alreadySeeded = existing && existing.length > 0;
  if (alreadySeeded) {
    console.log(`  ✓ demo contracts already present (${existing.length}); skipping re-seed`);
    console.log("\nDone. Demo logins:");
    for (const d of DEMO_USERS) {
      console.log(`  ${d.email} / Demo123!  (${d.role})`);
    }
    return;
  }

  const admin = seeder; // use PM session for inserts where user_id must match auth.uid()
  void adminId;
  void adminClient;

  const contracts = [
    {
      id: CONTRACT_IDS[0],
      user_id: pmId,
      client_user_id: clientId,
      contract_name: "Downtown Office Tower Renovation",
      client_name: "Meridian Holdings LLC",
      client_email: "client@gcmanager.demo",
      client_phone: "312-555-0101",
      project_address: "400 W Wacker Dr",
      city: "Chicago",
      state: "IL",
      contract_type: "fixed_price",
      original_value: 850000,
      retainage_percent: 10,
      start_date: daysFromNow(-150),
      end_date: daysFromNow(60),
      status: "active",
      scope_description: "Interior renovation floors 12-18 including MEP upgrades.",
      special_terms: "Liquidated damages $1,500/day past substantial completion.",
    },
    {
      id: CONTRACT_IDS[1],
      user_id: pmId,
      client_user_id: clientId,
      contract_name: "Riverside Medical Center Expansion",
      client_name: "Riverside Health Partners",
      client_email: "client@gcmanager.demo",
      client_phone: "217-555-0177",
      project_address: "1200 Riverside Pkwy",
      city: "Springfield",
      state: "IL",
      contract_type: "cost_plus",
      original_value: 1250000,
      retainage_percent: 5,
      start_date: daysFromNow(-200),
      end_date: daysFromNow(120),
      status: "active",
      scope_description: "New outpatient wing with imaging suite.",
      special_terms: "Cost-plus 12% fee with open-book reporting.",
    },
    {
      id: CONTRACT_IDS[2],
      user_id: pmId,
      client_user_id: clientId,
      contract_name: "Lakeside Apartments Phase 2",
      client_name: "Lakeside Development Co",
      client_email: "client@gcmanager.demo",
      client_phone: "708-555-0144",
      project_address: "88 Lakeshore Blvd",
      city: "Evanston",
      state: "IL",
      contract_type: "fixed_price",
      original_value: 2100000,
      retainage_percent: 10,
      start_date: daysFromNow(-400),
      end_date: daysFromNow(-30),
      status: "completed",
      scope_description: "48-unit residential Phase 2 buildout.",
      special_terms: "Multiple approved change orders increased contract value.",
    },
    {
      id: CONTRACT_IDS[3],
      user_id: pmId,
      contract_name: "Westside Retail Plaza",
      client_name: "Westside Retail Group",
      client_email: "retail@example.com",
      client_phone: "773-555-0190",
      project_address: "2200 W Madison St",
      city: "Chicago",
      state: "IL",
      contract_type: "time_and_materials",
      original_value: 640000,
      retainage_percent: 10,
      start_date: daysFromNow(-90),
      end_date: daysFromNow(180),
      status: "active",
      scope_description: "Shell and core for retail plaza.",
      special_terms: "T&M with not-to-exceed cap.",
    },
    {
      id: CONTRACT_IDS[4],
      user_id: pmId,
      contract_name: "Northgate Warehouse Build-Out",
      client_name: "Northgate Logistics",
      client_email: "ops@northgate.example",
      client_phone: "847-555-0112",
      project_address: "500 Industrial Pkwy",
      city: "Elk Grove Village",
      state: "IL",
      contract_type: "fixed_price",
      original_value: 975000,
      retainage_percent: 10,
      start_date: daysFromNow(-60),
      end_date: daysFromNow(200),
      status: "on_hold",
      scope_description: "Warehouse racking and office build-out.",
      special_terms: "On hold pending owner financing.",
    },
    {
      id: CONTRACT_IDS[5],
      user_id: pmId,
      contract_name: "Harbor View Condominiums",
      client_name: "Harbor View LLC",
      client_email: "harbor@example.com",
      client_phone: "312-555-0166",
      project_address: "15 Harbor Dr",
      city: "Chicago",
      state: "IL",
      contract_type: "fixed_price",
      original_value: 720000,
      retainage_percent: 10,
      start_date: daysFromNow(-180),
      end_date: daysFromNow(40),
      status: "active",
      scope_description: "Condo common area and unit finishes.",
      special_terms: "UNPROFITABLE DEMO — costs intentionally exceed value.",
    },
    {
      id: CONTRACT_IDS[6],
      user_id: pmId,
      client_user_id: clientId,
      contract_name: "Cedar Grove Elementary Addition",
      client_name: "Cedar Grove School District",
      client_email: "client@gcmanager.demo",
      client_phone: "630-555-0188",
      project_address: "100 School Rd",
      city: "Naperville",
      state: "IL",
      contract_type: "cost_plus",
      original_value: 1580000,
      retainage_percent: 5,
      start_date: daysFromNow(-250),
      end_date: daysFromNow(20),
      status: "active",
      scope_description: "Classroom wing addition nearing completion.",
      special_terms: "Significant unpaid balance near end date.",
    },
    {
      id: CONTRACT_IDS[7],
      user_id: pmId,
      contract_name: "Metro Parking Structure",
      client_name: "Metro Transit Authority",
      client_email: "metro@example.com",
      client_phone: "312-555-0120",
      project_address: "900 Transit Way",
      city: "Chicago",
      state: "IL",
      contract_type: "fixed_price",
      original_value: 3200000,
      retainage_percent: 10,
      start_date: daysFromNow(-100),
      end_date: daysFromNow(300),
      status: "canceled",
      scope_description: "Parking structure — canceled after redesign.",
      special_terms: "Canceled by owner.",
    },
  ];

  const { error: cErr } = await admin.from("contracts").insert(contracts);
  if (cErr) throw cErr;
  console.log("  ✓ 8 contracts");

  await admin.from("contract_assignments").insert([
    { contract_id: CONTRACT_IDS[0], user_id: fieldId },
    { contract_id: CONTRACT_IDS[1], user_id: fieldId },
    { contract_id: CONTRACT_IDS[3], user_id: fieldId },
    { contract_id: CONTRACT_IDS[5], user_id: fieldId },
    { contract_id: CONTRACT_IDS[6], user_id: fieldId },
  ]);
  console.log("  ✓ field assignments");

  await admin.from("change_orders").insert([
    { contract_id: CONTRACT_IDS[0], change_order_number: "CO-001", description: "Additional lobby millwork", reason: "Owner Request", amount: 45000, status: "approved", date_submitted: daysFromNow(-100), date_resolved: daysFromNow(-90) },
    { contract_id: CONTRACT_IDS[0], change_order_number: "CO-002", description: "Unforeseen electrical panel upgrade", reason: "Unforeseen Conditions", amount: 28000, status: "pending", date_submitted: daysFromNow(-10) },
    { contract_id: CONTRACT_IDS[1], change_order_number: "CO-001", description: "Imaging suite shielding upgrade", reason: "Design Change", amount: 120000, status: "approved", date_submitted: daysFromNow(-80), date_resolved: daysFromNow(-70) },
    { contract_id: CONTRACT_IDS[2], change_order_number: "CO-001", description: "Balcony waterproofing upgrade", reason: "Owner Request", amount: 85000, status: "approved", date_submitted: daysFromNow(-200), date_resolved: daysFromNow(-190) },
    { contract_id: CONTRACT_IDS[2], change_order_number: "CO-002", description: "Elevator finish package", reason: "Owner Request", amount: 62000, status: "approved", date_submitted: daysFromNow(-180), date_resolved: daysFromNow(-170) },
    { contract_id: CONTRACT_IDS[2], change_order_number: "CO-003", description: "Lobby redesign", reason: "Design Change", amount: 110000, status: "approved", date_submitted: daysFromNow(-150), date_resolved: daysFromNow(-140) },
    { contract_id: CONTRACT_IDS[3], change_order_number: "CO-001", description: "Extra storefront glazing", reason: "Owner Request", amount: 34000, status: "rejected", date_submitted: daysFromNow(-40), date_resolved: daysFromNow(-35) },
    { contract_id: CONTRACT_IDS[3], change_order_number: "CO-002", description: "Night work premium", reason: "Other", amount: 18000, status: "pending", date_submitted: daysFromNow(-5) },
    { contract_id: CONTRACT_IDS[4], change_order_number: "CO-001", description: "Soil remediation", reason: "Unforeseen Conditions", amount: 95000, status: "pending", date_submitted: daysFromNow(-20) },
    { contract_id: CONTRACT_IDS[5], change_order_number: "CO-001", description: "Facade repair allowance", reason: "Unforeseen Conditions", amount: 40000, status: "approved", date_submitted: daysFromNow(-60), date_resolved: daysFromNow(-55) },
    { contract_id: CONTRACT_IDS[5], change_order_number: "CO-002", description: "Rejected premium materials", reason: "Owner Request", amount: 22000, status: "rejected", date_submitted: daysFromNow(-50), date_resolved: daysFromNow(-48) },
    { contract_id: CONTRACT_IDS[6], change_order_number: "CO-001", description: "Technology conduit extras", reason: "Design Change", amount: 55000, status: "approved", date_submitted: daysFromNow(-90), date_resolved: daysFromNow(-85) },
    { contract_id: CONTRACT_IDS[6], change_order_number: "CO-002", description: "Playground soft costs", reason: "Owner Request", amount: 30000, status: "pending", date_submitted: daysFromNow(-8) },
    { contract_id: CONTRACT_IDS[0], change_order_number: "CO-003", description: "Rejected overtime claim", reason: "Other", amount: 12000, status: "rejected", date_submitted: daysFromNow(-70), date_resolved: daysFromNow(-65) },
    { contract_id: CONTRACT_IDS[1], change_order_number: "CO-002", description: "Pending nurse station revision", reason: "Design Change", amount: 48000, status: "pending", date_submitted: daysFromNow(-3) },
  ]);
  console.log("  ✓ 15 change orders");

  await admin.from("subcontractors").insert([
    { contract_id: CONTRACT_IDS[0], company_name: "Spark Electric Co", contact_name: "Sam Spark", contact_email: "sam@spark.example", contact_phone: "312-555-1001", trade: "Electrical", subcontract_value: 180000, amount_paid: 90000, retainage_percent: 10, status: "active", user_id: subId, scope_of_work: "Power and lighting floors 12-18", start_date: daysFromNow(-140), end_date: daysFromNow(50) },
    { contract_id: CONTRACT_IDS[0], company_name: "Flow Plumbing Inc", contact_name: "Pat Flow", contact_email: "pat@flow.example", contact_phone: "312-555-1002", trade: "Plumbing", subcontract_value: 120000, amount_paid: 60000, retainage_percent: 10, status: "active", scope_of_work: "Restroom and pantry plumbing", start_date: daysFromNow(-130), end_date: daysFromNow(40) },
    { contract_id: CONTRACT_IDS[1], company_name: "Climate HVAC LLC", contact_name: "Chris Air", contact_email: "chris@climate.example", contact_phone: "217-555-1003", trade: "HVAC", subcontract_value: 260000, amount_paid: 130000, retainage_percent: 5, status: "active", user_id: subId, scope_of_work: "Medical-grade HVAC", start_date: daysFromNow(-180), end_date: daysFromNow(100) },
    { contract_id: CONTRACT_IDS[1], company_name: "Solid Concrete Works", contact_name: "Connie Solid", contact_email: "connie@solid.example", contact_phone: "217-555-1004", trade: "Concrete", subcontract_value: 310000, amount_paid: 310000, retainage_percent: 5, status: "complete", scope_of_work: "Foundations and slabs", start_date: daysFromNow(-190), end_date: daysFromNow(-40) },
    { contract_id: CONTRACT_IDS[2], company_name: "FrameRight Carpentry", contact_name: "Fran Frame", contact_email: "fran@frameright.example", contact_phone: "708-555-1005", trade: "Framing", subcontract_value: 240000, amount_paid: 240000, retainage_percent: 10, status: "complete", scope_of_work: "Wood framing Phase 2", start_date: daysFromNow(-380), end_date: daysFromNow(-100) },
    { contract_id: CONTRACT_IDS[3], company_name: "Retail Glazing Pros", contact_name: "Gina Glass", contact_email: "gina@glazing.example", contact_phone: "773-555-1006", trade: "Other", subcontract_value: 95000, amount_paid: 40000, retainage_percent: 10, status: "active", scope_of_work: "Storefront systems", start_date: daysFromNow(-80), end_date: daysFromNow(150) },
    { contract_id: CONTRACT_IDS[5], company_name: "Overpaid Demo Sub", contact_name: "Ollie Over", contact_email: "ollie@over.example", contact_phone: "312-555-1007", trade: "Other", subcontract_value: 50000, amount_paid: 67500, retainage_percent: 10, status: "active", user_id: subId, scope_of_work: "DEMO: payments exceed subcontract value", start_date: daysFromNow(-100), end_date: daysFromNow(30) },
    { contract_id: CONTRACT_IDS[6], company_name: "School Safe Electric", contact_name: "Eddy Volt", contact_email: "eddy@schoolsafe.example", contact_phone: "630-555-1008", trade: "Electrical", subcontract_value: 220000, amount_paid: 150000, retainage_percent: 5, status: "active", scope_of_work: "Classroom power and data", start_date: daysFromNow(-220), end_date: daysFromNow(15) },
    { contract_id: CONTRACT_IDS[6], company_name: "Naperville HVAC", contact_name: "Helen Heat", contact_email: "helen@napervillehvac.example", contact_phone: "630-555-1009", trade: "HVAC", subcontract_value: 175000, amount_paid: 100000, retainage_percent: 5, status: "active", scope_of_work: "Classroom HVAC", start_date: daysFromNow(-210), end_date: daysFromNow(15) },
    { contract_id: CONTRACT_IDS[4], company_name: "Paused Piping Co", contact_name: "Pete Pipe", contact_email: "pete@paused.example", contact_phone: "847-555-1010", trade: "Plumbing", subcontract_value: 88000, amount_paid: 10000, retainage_percent: 10, status: "terminated", scope_of_work: "Paused with project hold", start_date: daysFromNow(-50), end_date: daysFromNow(180) },
  ]);
  console.log("  ✓ 10 subcontractors");

  const costCats = ["labor", "materials", "subcontractor", "equipment", "permits", "other"];
  const costRows = [];
  for (let i = 0; i < 30; i++) {
    const contractId = CONTRACT_IDS[i % 7]; // skip canceled mostly
    const amount =
      contractId === CONTRACT_IDS[5]
        ? 20000 + (i % 5) * 15000 // inflate harbor view costs
        : 5000 + (i % 8) * 3500;
    costRows.push({
      contract_id: contractId,
      user_id: i % 2 === 0 ? fieldId : pmId,
      category: costCats[i % costCats.length],
      description: `Cost entry #${i + 1}`,
      amount,
      date_incurred: daysFromNow(- (i * 3 + 2)),
      notes: contractId === CONTRACT_IDS[5] ? "Part of unprofitable job" : null,
    });
  }
  // Extra costs to push Harbor View over value
  costRows.push(
    { contract_id: CONTRACT_IDS[5], user_id: pmId, category: "labor", description: "Overrun labor package", amount: 180000, date_incurred: daysFromNow(-20), notes: "Unprofitable demo" },
    { contract_id: CONTRACT_IDS[5], user_id: pmId, category: "materials", description: "Material escalation", amount: 150000, date_incurred: daysFromNow(-15), notes: "Unprofitable demo" }
  );
  await admin.from("cost_entries").insert(costRows);
  console.log("  ✓ cost entries");

  const invoices = [
    { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1", contract_id: CONTRACT_IDS[0], invoice_number: "INV-1001", invoice_date: daysFromNow(-90), due_date: daysFromNow(-60), description: "Progress billing 1", invoice_amount: 200000, retainage_percent: 10, retainage_amount: 20000, net_amount_due: 180000, amount_paid: 180000, status: "paid" },
    { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2", contract_id: CONTRACT_IDS[0], invoice_number: "INV-1002", invoice_date: daysFromNow(-40), due_date: daysFromNow(-10), description: "Progress billing 2", invoice_amount: 150000, retainage_percent: 10, retainage_amount: 15000, net_amount_due: 135000, amount_paid: 50000, status: "partially_paid" },
    { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3", contract_id: CONTRACT_IDS[1], invoice_number: "INV-2001", invoice_date: daysFromNow(-100), due_date: daysFromNow(-70), description: "Mobilization", invoice_amount: 300000, retainage_percent: 5, retainage_amount: 15000, net_amount_due: 285000, amount_paid: 285000, status: "paid" },
    { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4", contract_id: CONTRACT_IDS[1], invoice_number: "INV-2002", invoice_date: daysFromNow(-20), due_date: daysFromNow(10), description: "Structure billing", invoice_amount: 250000, retainage_percent: 5, retainage_amount: 12500, net_amount_due: 237500, amount_paid: 0, status: "unpaid" },
    { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb5", contract_id: CONTRACT_IDS[2], invoice_number: "INV-3001", invoice_date: daysFromNow(-120), due_date: daysFromNow(-90), description: "Final billing", invoice_amount: 400000, retainage_percent: 10, retainage_amount: 40000, net_amount_due: 360000, amount_paid: 360000, status: "paid" },
    { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb6", contract_id: CONTRACT_IDS[3], invoice_number: "INV-4001", invoice_date: daysFromNow(-50), due_date: daysFromNow(-20), description: "T&M billing", invoice_amount: 80000, retainage_percent: 10, retainage_amount: 8000, net_amount_due: 72000, amount_paid: 0, status: "overdue" },
    { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb7", contract_id: CONTRACT_IDS[5], invoice_number: "INV-6001", invoice_date: daysFromNow(-100), due_date: daysFromNow(-70), description: "Progress", invoice_amount: 100000, retainage_percent: 10, retainage_amount: 10000, net_amount_due: 90000, amount_paid: 90000, status: "paid" },
    { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb8", contract_id: CONTRACT_IDS[6], invoice_number: "INV-7001", invoice_date: daysFromNow(-80), due_date: daysFromNow(-50), description: "Progress A", invoice_amount: 350000, retainage_percent: 5, retainage_amount: 17500, net_amount_due: 332500, amount_paid: 332500, status: "paid" },
    { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb9", contract_id: CONTRACT_IDS[6], invoice_number: "INV-7002", invoice_date: daysFromNow(-45), due_date: daysFromNow(-15), description: "Progress B", invoice_amount: 280000, retainage_percent: 5, retainage_amount: 14000, net_amount_due: 266000, amount_paid: 100000, status: "partially_paid" },
    { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb10", contract_id: CONTRACT_IDS[6], invoice_number: "INV-7003", invoice_date: daysFromNow(-100), due_date: daysFromNow(-70), description: "OVERDUE 60+ days demo", invoice_amount: 175000, retainage_percent: 5, retainage_amount: 8750, net_amount_due: 166250, amount_paid: 0, status: "overdue" },
    { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb11", contract_id: CONTRACT_IDS[0], invoice_number: "INV-1003", invoice_date: daysFromNow(-5), due_date: daysFromNow(25), description: "Current billing", invoice_amount: 90000, retainage_percent: 10, retainage_amount: 9000, net_amount_due: 81000, amount_paid: 0, status: "unpaid" },
    { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb12", contract_id: CONTRACT_IDS[3], invoice_number: "INV-4002", invoice_date: daysFromNow(-10), due_date: daysFromNow(20), description: "Materials billing", invoice_amount: 45000, retainage_percent: 10, retainage_amount: 4500, net_amount_due: 40500, amount_paid: 0, status: "unpaid" },
  ];
  // Fix overdue dates for 60+ day case
  invoices[9].invoice_date = daysFromNow(-100);
  invoices[9].due_date = daysFromNow(-75);

  await admin.from("invoices").insert(invoices);
  console.log("  ✓ 12 invoices");

  await admin.from("payments").insert([
    { invoice_id: invoices[0].id, payment_amount: 180000, payment_date: daysFromNow(-55), payment_method: "ACH", reference_number: "ACH-1001" },
    { invoice_id: invoices[1].id, payment_amount: 50000, payment_date: daysFromNow(-5), payment_method: "Check", reference_number: "CHK-2044" },
    { invoice_id: invoices[2].id, payment_amount: 285000, payment_date: daysFromNow(-65), payment_method: "Wire", reference_number: "WIRE-88" },
    { invoice_id: invoices[4].id, payment_amount: 360000, payment_date: daysFromNow(-85), payment_method: "ACH", reference_number: "ACH-3001" },
    { invoice_id: invoices[6].id, payment_amount: 90000, payment_date: daysFromNow(-60), payment_method: "Check", reference_number: "CHK-6001" },
    { invoice_id: invoices[7].id, payment_amount: 332500, payment_date: daysFromNow(-40), payment_method: "Wire", reference_number: "WIRE-7001" },
    { invoice_id: invoices[8].id, payment_amount: 100000, payment_date: daysFromNow(-10), payment_method: "ACH", reference_number: "ACH-7002" },
    { invoice_id: invoices[1].id, payment_amount: 0, payment_date: daysFromNow(-1), payment_method: "Other", reference_number: "NOTE", notes: "placeholder skipped" },
  ].filter((p) => p.payment_amount > 0));
  console.log("  ✓ payments");

  const fieldLogs = [];
  for (let i = 0; i < 15; i++) {
    fieldLogs.push({
      contract_id: CONTRACT_IDS[i % 5 === 4 ? 0 : i % 5],
      user_id: i % 3 === 0 ? subId : fieldId,
      log_date: daysFromNow(-(i + 1)),
      work_performed: `Field progress update #${i + 1}`,
      hours_worked: 6 + (i % 4),
      workers_on_site: 4 + (i % 6),
      weather_conditions: ["Clear", "Cloudy", "Rain", "Wind"][i % 4],
      equipment_used: "Scissor lift, hand tools",
      materials_used: "Drywall, fasteners",
      issues_or_delays: i % 5 === 0 ? "Material delivery delay" : null,
      notes: "Demo field log",
    });
  }
  await admin.from("field_logs").insert(fieldLogs);
  console.log("  ✓ 15 field logs");

  const milestones = [];
  const names = ["Mobilization", "Foundations", "Structure", "MEP Rough-In", "Finishes", "Punch List"];
  for (let c = 0; c < 8; c++) {
    const count = c < 4 ? 3 : 2;
    for (let m = 0; m < count; m++) {
      milestones.push({
        contract_id: CONTRACT_IDS[c],
        milestone_name: names[m],
        milestone_value: 50000 + m * 25000,
        due_date: daysFromNow(-100 + c * 10 + m * 20),
        status: m === 0 ? "completed" : m === 1 ? "in_progress" : "pending",
      });
    }
  }
  // Ensure 20
  while (milestones.length < 20) {
    milestones.push({
      contract_id: CONTRACT_IDS[0],
      milestone_name: `Extra Milestone ${milestones.length}`,
      milestone_value: 15000,
      due_date: daysFromNow(30),
      status: "pending",
    });
  }
  await admin.from("milestones").insert(milestones.slice(0, 20));
  console.log("  ✓ 20 milestones");

  console.log("\nDone. Demo logins:");
  for (const d of DEMO_USERS) {
    console.log(`  ${d.email} / Demo123!  (${d.role})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
