import { withSupabase } from 'npm:@supabase/server@^1'

// Кто может вызывать эту функцию (добавлять/менять сотрудников) — тимлид,
// арт-директор, CEO, плюс отдельно auth_admin проверяется ниже через is_admin.
const ADMIN_ROLES = ['lead', 'art_director', 'ceo']
// Более узкий круг — кто может выдавать/снимать сам флаг "Админ-доступ"
// (см. проверку в action === 'update' ниже). Тимлид сюда не входит.
const ADMIN_ROLES_FOR_ADMIN_GRANT = ['art_director', 'ceo']

// Раньше здесь был свой захардкоженный VALID_ROLES-массив, отдельный от
// CHECK-ограничения в БД — рассинхрон между ними дважды ронял прод (роль
// "manager", потом "marketer": добавляли в приложение, забывали обновить
// список тут). Теперь допустимость роли проверяется прямо по таблице
// public.roles (см. миграцию 20260930m_roles_table.sql) — единственному
// месту, которое перечисляет, какие роли вообще существуют.
async function isValidRole(ctx: any, role: string): Promise<boolean> {
  const { data, error } = await ctx.supabaseAdmin.from('roles').select('id').eq('id', role).maybeSingle()
  return !error && !!data
}

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
      const { full_name, role, email, pin, team_group, hire_date, birthday } = body
      if (!full_name || !role || !email || !pin) {
        return Response.json({ error: 'Заполните все поля' }, { status: 400 })
      }
      if (pin.length < 6) {
        return Response.json({ error: 'PIN должен быть не короче 6 символов' }, { status: 400 })
      }
      if (!(await isValidRole(ctx, role))) {
        return Response.json({ error: 'Неверная роль' }, { status: 400 })
      }

      const { data: newUser, error: createError } = await ctx.supabaseAdmin.auth.admin.createUser({
        email, password: pin, email_confirm: true
      })
      if (createError) return Response.json({ error: createError.message }, { status: 400 })

      const { error: insertError } = await ctx.supabaseAdmin.from('profiles').insert({
        id: newUser.user.id, full_name, role, login_email: email, is_admin: false, is_active: true,
        team_group: team_group || null, hire_date: hire_date || null, birthday: birthday || null
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
      const { id, full_name, role, is_admin, is_active, email, pin, team_group, hire_date, birthday, vacation_days_per_year } = body
      if (!id) return Response.json({ error: 'Не указан сотрудник' }, { status: 400 })

      // Защита от случайной самоблокировки
      if (id === ctx.userClaims.id && is_active === false) {
        return Response.json({ error: 'Нельзя деактивировать самого себя' }, { status: 400 })
      }
      if (role !== undefined && !(await isValidRole(ctx, role))) {
        return Response.json({ error: 'Неверная роль' }, { status: 400 })
      }
      if (vacation_days_per_year !== undefined && (!Number.isInteger(vacation_days_per_year) || vacation_days_per_year < 0)) {
        return Response.json({ error: 'Норма отпуска должна быть целым числом дней' }, { status: 400 })
      }
      // Флаг "Админ-доступ" — самый мощный рычаг (полный доступ независимо от
      // роли), поэтому его может выдавать/снимать только тот, у кого он уже
      // есть, или арт-директор/CEO — тимлиду это недоступно, даже если он
      // получит право добавлять/менять сотрудников через эту же функцию.
      const callerCanGrantAdmin = !!callerProfile.is_admin || ADMIN_ROLES_FOR_ADMIN_GRANT.includes(callerProfile.role)
      if (is_admin !== undefined && !callerCanGrantAdmin) {
        return Response.json({ error: 'Только арт-директор, директор или админ может менять админ-доступ' }, { status: 403 })
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
      if (hire_date !== undefined) profileUpdate.hire_date = hire_date || null
      if (birthday !== undefined) profileUpdate.birthday = birthday || null
      if (vacation_days_per_year !== undefined) profileUpdate.vacation_days_per_year = vacation_days_per_year

      if (Object.keys(profileUpdate).length > 0) {
        const { error: updError } = await ctx.supabaseAdmin.from('profiles').update(profileUpdate).eq('id', id)
        if (updError) return Response.json({ error: updError.message }, { status: 400 })
      }

      return Response.json({ success: true })
    }

    return Response.json({ error: 'Неизвестное действие' }, { status: 400 })
  }),
}
