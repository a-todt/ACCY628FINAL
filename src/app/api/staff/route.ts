import { createClient as createAuthClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

const STAFF_ROLES: UserRole[] = ["owner", "project_manager", "field_supervisor"];

type Body = {
  fullName?: string;
  email?: string;
  password?: string;
  employeeId?: string;
  title?: string;
  phone?: string;
  role?: UserRole;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: requester } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (requester?.role !== "owner" && requester?.role !== "admin") {
      return NextResponse.json(
        { error: "Only owners and admins can add staff." },
        { status: 403 }
      );
    }

    const body = (await request.json()) as Body;
    const fullName = body.fullName?.trim();
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";
    const role = body.role;

    if (!fullName || !email || password.length < 6 || !role || !STAFF_ROLES.includes(role)) {
      return NextResponse.json(
        { error: "Name, email, a 6+ character temporary password, and staff role are required." },
        { status: 400 }
      );
    }

    // Use an isolated auth client so creating the account cannot replace the
    // owner/admin session attached to this request.
    const signupClient = createAuthClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data: signup, error: signupError } = await signupClient.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, intended_role: role } },
    });

    if (signupError) {
      return NextResponse.json({ error: signupError.message }, { status: 400 });
    }
    if (!signup.user) {
      return NextResponse.json({ error: "Staff account could not be created." }, { status: 500 });
    }

    const { error: profileError } = await supabase
      .from("user_profiles")
      .update({
        full_name: fullName,
        email,
        employee_id: body.employeeId?.trim() || null,
        title: body.title?.trim() || null,
        phone: body.phone?.trim() || null,
        role,
        is_active: true,
        onboarding_complete: false,
      })
      .eq("id", signup.user.id);

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    await supabase.rpc("write_access_audit", {
      p_action: "staff_created",
      p_entity_type: "user_profiles",
      p_entity_id: signup.user.id,
      p_details: { email, role },
    });

    return NextResponse.json({
      id: signup.user.id,
      requiresEmailConfirmation: !signup.session,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add staff.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
