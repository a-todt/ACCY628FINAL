import { createClient as createAuthClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

/** Internal employees that can be created/removed from Company Management → Team. */
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

type DeleteBody = {
  id?: string;
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
        { error: "Only company admins and Accounting can add staff." },
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

    // Only company Admin may create additional Accounting logins.
    if (role === "owner" && requester?.role !== "admin") {
      return NextResponse.json(
        { error: "Only company admins can create Accounting users." },
        { status: 403 }
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
        onboarding_complete: role === "project_manager" || role === "owner",
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

/** Permanently delete an internal employee (auth user + profile). Admin only. */
export async function DELETE(request: Request) {
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

    if (requester?.role !== "admin") {
      return NextResponse.json(
        { error: "Only Admin can delete internal employees." },
        { status: 403 }
      );
    }

    const body = (await request.json()) as DeleteBody;
    const targetId = body.id?.trim();
    if (!targetId) {
      return NextResponse.json({ error: "Employee id is required." }, { status: 400 });
    }

    if (targetId === user.id) {
      return NextResponse.json(
        { error: "You cannot delete your own account." },
        { status: 400 }
      );
    }

    const { data: target, error: targetError } = await supabase
      .from("user_profiles")
      .select("id, email, full_name, role")
      .eq("id", targetId)
      .maybeSingle();

    if (targetError) {
      return NextResponse.json({ error: targetError.message }, { status: 400 });
    }
    if (!target) {
      return NextResponse.json({ error: "Employee not found." }, { status: 404 });
    }
    if (!STAFF_ROLES.includes(target.role as UserRole)) {
      return NextResponse.json(
        {
          error:
            "Only internal employees (Accounting, Project Manager, Field Supervisor) can be deleted here.",
        },
        { status: 400 }
      );
    }

    await supabase.rpc("write_access_audit", {
      p_action: "staff_deleted",
      p_entity_type: "user_profiles",
      p_entity_id: target.id,
      p_details: {
        email: target.email,
        full_name: target.full_name,
        role: target.role,
      },
    });

    const admin = createAdminClient();
    const { error: deleteError } = await admin.auth.admin.deleteUser(targetId);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete staff.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
