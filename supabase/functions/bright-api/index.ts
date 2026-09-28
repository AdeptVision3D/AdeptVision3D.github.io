// Edge Function "bright-api" — единственное место в системе, которое работает
// с Supabase Auth от имени администратора (service role). Нужна, потому что
// создание/изменение логина и PIN сотрудника — это операции над Supabase Auth,
// а не просто запись в таблицу, и анонимный ключ на них прав не даёт.
//
// Поддерживает два действия (body.action):
//   "create" — создать нового сотрудника (Auth-пользователь + строка в profiles)
//   "update" — изменить существующего: имя/роль/админ-флаг/активность,
//              и опционально логин (email) и/или PIN
//
// Как применить обновление в Supabase Dashboard:
//   1. Project → Edge Functions → bright-api → Edit code
//   2. Заменить содержимое целиком на файл ниже → Deploy
// (см. также supabase/migrations/20260928_add_profile_admin_active.sql —
//  её нужно выполнить ДО того, как эта функция начнёт использовать is_admin/is_active)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Роли, которые по умолчанию (без флага is_admin) считаются управляющими.
const ADMIN_ROLES = ["ceo", "art_director"];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse({});

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return jsonResponse({ error: "Не авторизовано" }, 401);

    // Клиент с правами администратора — используется и чтобы узнать, кто вызывает
    // функцию (через токен), и чтобы выполнить сами административные операции.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return jsonResponse({ error: "Не авторизовано" }, 401);

    const { data: callerProfile, error: callerErr } = await admin
      .from("profiles")
      .select("*")
      .eq("id", userData.user.id)
      .single();
    if (callerErr || !callerProfile) return jsonResponse({ error: "Профиль не найден" }, 403);

    const callerIsAdmin = callerProfile.is_admin === true || ADMIN_ROLES.includes(callerProfile.role);
    if (!callerIsAdmin) return jsonResponse({ error: "Недостаточно прав" }, 403);

    const body = await req.json();
    const action = body.action || "create";

    // ---------- Создание сотрудника ----------
    if (action === "create") {
      const { full_name, role, email, pin } = body;
      if (!full_name || !role || !email || !pin) {
        return jsonResponse({ error: "Заполните все поля" }, 400);
      }
      if (String(pin).length < 6) {
        return jsonResponse({ error: "PIN должен быть не короче 6 символов" }, 400);
      }

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: pin,
        email_confirm: true,
      });
      if (createErr || !created?.user) {
        return jsonResponse({ error: createErr?.message || "Не удалось создать пользователя" }, 400);
      }

      const { error: profileErr } = await admin.from("profiles").insert({
        id: created.user.id,
        full_name,
        role,
        login_email: email,
        is_admin: false,
        is_active: true,
      });
      if (profileErr) {
        // Откат — не оставляем "осиротевший" Auth-аккаунт без профиля
        await admin.auth.admin.deleteUser(created.user.id);
        return jsonResponse({ error: profileErr.message }, 400);
      }
      return jsonResponse({ ok: true });
    }

    // ---------- Изменение сотрудника ----------
    if (action === "update") {
      const { id, full_name, role, is_admin, is_active, email, pin } = body;
      if (!id) return jsonResponse({ error: "Не указан сотрудник" }, 400);

      // Защита от случайной самоблокировки
      if (id === userData.user.id && is_active === false) {
        return jsonResponse({ error: "Нельзя деактивировать самого себя" }, 400);
      }

      // Смена логина и/или PIN — это Supabase Auth, не просто таблица
      if (email || pin) {
        if (pin && String(pin).length < 6) {
          return jsonResponse({ error: "PIN должен быть не короче 6 символов" }, 400);
        }
        const authUpdate: Record<string, unknown> = {};
        if (email) authUpdate.email = email;
        if (pin) authUpdate.password = pin;
        const { error: authErr } = await admin.auth.admin.updateUserById(id, authUpdate);
        if (authErr) return jsonResponse({ error: authErr.message }, 400);
      }

      const profileUpdate: Record<string, unknown> = {};
      if (full_name !== undefined) profileUpdate.full_name = full_name;
      if (role !== undefined) profileUpdate.role = role;
      if (is_admin !== undefined) profileUpdate.is_admin = is_admin;
      if (is_active !== undefined) profileUpdate.is_active = is_active;
      if (email !== undefined) profileUpdate.login_email = email;

      if (Object.keys(profileUpdate).length > 0) {
        const { error: updErr } = await admin.from("profiles").update(profileUpdate).eq("id", id);
        if (updErr) return jsonResponse({ error: updErr.message }, 400);
      }
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: "Неизвестное действие" }, 400);
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
