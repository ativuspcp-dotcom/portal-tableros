// Deno Deploy Supabase Edge Function: create-user
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    // 1. Extract and decode the JWT to get user ID
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const payloadPart = token.split('.')[1]
    if (!payloadPart) {
      return new Response(JSON.stringify({ error: 'Invalid JWT format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
    const decodedPayload = JSON.parse(atob(base64))
    const callerId = decodedPayload.sub

    if (!callerId) {
      return new Response(JSON.stringify({ error: 'Invalid token subject' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 2. Initialize admin client for operations
    const adminClient = createClient(supabaseUrl, supabaseServiceRole, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Fetch the caller's profile to verify role
    const { data: callerProfile, error: profileError } = await adminClient
      .from('user_profiles')
      .select('role')
      .eq('id', callerId)
      .single()

    if (profileError || !callerProfile || !['super_admin', 'admin'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'Forbidden: Insufficient role permissions' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body = await req.json()

    // ── CASE A: DELETE USER ──
    if (body.action === 'delete') {
      const { userId } = body
      if (!userId) {
        return new Response(JSON.stringify({ error: 'userId is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Only super_admin can delete
      if (callerProfile.role !== 'super_admin') {
        return new Response(JSON.stringify({ error: 'Only super_admin can delete users' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId)
      if (deleteError) throw deleteError

      return new Response(JSON.stringify({ success: true, message: 'User deleted successfully' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── CASE B: CREATE USER ──
    const { email, password, full_name, role, department, job_title, status, module_permissions, filiais_permitidas } = body

    if (!email || !password || !full_name) {
      return new Response(JSON.stringify({ error: 'Missing required fields (email, password, full_name)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Only super_admin can create another super_admin
    if (role === 'super_admin' && callerProfile.role !== 'super_admin') {
      return new Response(JSON.stringify({ error: 'Only super_admin can create super_admin users' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 1. Create auth user
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    })

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const newUserId = authData.user.id

    // 2. Update user_profiles
    const { error: profileUpdateErr } = await adminClient
      .from('user_profiles')
      .update({
        full_name,
        role: role || 'user',
        department: department || null,
        job_title: job_title || null,
        status: status || 'active',
        filiais_permitidas: filiais_permitidas || [1]
      })
      .eq('id', newUserId)

    if (profileUpdateErr) throw profileUpdateErr

    // Insert permissions if present
    if (module_permissions && module_permissions.length > 0) {
      const records = module_permissions.map((p: any) => ({
        user_id: newUserId,
        module_id: p.module_id,
        can_view: p.can_view || false,
        can_create: p.can_create || false,
        can_edit: p.can_edit || false,
        can_delete: p.can_delete || false,
        granted_by: callerId
      }))

      const { error: permError } = await adminClient
        .from('user_module_permissions')
        .insert(records)

      if (permError) {
        console.error('Error inserting permissions:', permError)
      }
    }

    return new Response(JSON.stringify({ user: authData.user, success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
