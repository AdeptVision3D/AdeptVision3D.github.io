import { withSupabase } from 'npm:@supabase/server@^1'

const ADMIN_ROLES = ['ceo', 'art_director']
const VALID_ROLES = ['artist', 'lead', 'art_director', 'ceo']

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    // ctx.supabase — с правами вызвавшего (проверяет RLS)
    // ctx.supabaseAdmin — полные права, для создания/изменения аккаунтов
    // ctx.userClaims — кто именно сейчас вызвал функцию

    const { data: callerProfile, error: profileErr } = await ctx.supabase
      .from('profiles')
      .select('role, is_admin')
      .eq('id', ctx.userClaims.id)
      .single()

    const callerIsAdmin = !profileErr && callerProfile && (callerProfile.is_admin || ADMIN_ROLES.includes(callerProfile.role))
    if (!callerIsAdmin) {
      return Response.json({ error: 'Недостаточно прав' }, { status: 403 })
    }

    const body = await req.json()
    const action = body.action || 'create'

    // ---------- Создание сотрудника (как было) ----------
    if (action === 'create') {
      const { full_name, role, email, pin, team_group } = body
      if (!full_name || !role || !email || !pin) {
        return Response.json({ error: 'Заполните все поля' }, { status: 400 })
      }
      if (pin.length < 6) {
        return Response.json({ error: 'PIN должен быть не короче 6 символов' }, { status: 400 })
      }
      if (!VALID_ROLES.includes(role)) {
        return Response.json({ error: 'Неверная роль' }, { status: 400 })
      }

      const { data: newUser, error: createError } = await ctx.supabaseAdmin.auth.admin.createUser({
        email, password: pin, email_confirm: true
      })
      if (createError) return Response.json({ error: createError.message }, { status: 400 })

      const { error: insertError } = await ctx.supabaseAdmin.from('profiles').insert({
        id: newUser.user.id, full_name, role, login_email: email, is_admin: false, is_active: true,
        team_group: team_group || null
      })
      if (insertError) {
        // Откат — не оставляем "осиротевший" аккаунт без профиля
        await ctx.supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
        return Response.json({ error: insertError.message }, { status: 400 })
      }

      return Response.json({ success: true })
    }

    // ---------- Изменение сотрудника (новое) ----------
    if (action === 'update') {
      const { id, full_name, role, is_admin, is_active, email, pin, team_group } = body
      if (!id) return Response.json({ error: 'Не указан сотрудник' }, { status: 400 })

      // Защита от случайной самоблокировки
      if (id === ctx.userClaims.id && is_active === false) {
        return Response.json({ error: 'Нельзя деактивировать самого себя' }, { status: 400 })
      }
      if (role !== undefined && !VALID_ROLES.includes(role)) {
        return Response.json({ error: 'Неверная роль' }, { status: 400 })
      }

      // Смена логина и/или PIN — это Supabase Auth, не просто таблица
      if (email || pin) {
        if (pin && pin.length < 6) {
          return Response.json({ error: 'PIN должен быть не короче 6 символов' }, { status: 400 })
        }
        const authUpdate: Record<string, unknown> = {}
        if (email) authUpdate.email = email
        if (pin) authUpdate.password = pin
        const { error: authErr } = await ctx.supabaseAdmin.auth.admin.updateUserById(id, authUpdate)
        if (authErr) return Response.json({ error: authErr.message }, { status: 400 })
      }

      const profileUpdate: Record<string, unknown> = {}
      if (full_name !== undefined) profileUpdate.full_name = full_name
      if (role !== undefined) profileUpdate.role = role
      if (is_admin !== undefined) profileUpdate.is_admin = is_admin
      if (is_active !== undefined) profileUpdate.is_active = is_active
      if (email !== undefined) profileUpdate.login_email = email
      if (team_group !== undefined) profileUpdate.team_group = team_group || null

      if (Object.keys(profileUpdate).length > 0) {
        const { error: updError } = await ctx.supabaseAdmin.from('profiles').update(profileUpdate).eq('id', id)
        if (updError) return Response.json({ error: updError.message }, { status: 400 })
      }

      return Response.json({ success: true })
    }

    return Response.json({ error: 'Неизвестное действие' }, { status: 400 })
  }),
}
