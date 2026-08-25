import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ success: false, error: 'POST required.' }, 405);

  const authorization = request.headers.get('Authorization');
  const accessToken = authorization?.replace(/^Bearer\s+/i, '').trim();
  if (!accessToken) return jsonResponse({ success: false, error: 'Authentication required.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ success: false, error: 'Function is not configured.' }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user?.email) return jsonResponse({ success: false, error: 'Authentication required.' }, 401);

  const input = await request.json().catch(() => null) as { token?: string } | null;
  const invitationToken = input?.token?.trim();
  if (!invitationToken || invitationToken.length < 32) {
    return jsonResponse({ success: false, error: 'Invitation token is required.' }, 422);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const tokenDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(invitationToken));
  const tokenHash = Array.from(new Uint8Array(tokenDigest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const { data: invitation, error: invitationError } = await adminClient
    .from('workspace_invitations')
    .select('id, workspace_id, email, role, status, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (invitationError || !invitation) return jsonResponse({ success: false, error: 'Invitation is invalid.' }, 404);
  if (invitation.status !== 'pending' || new Date(invitation.expires_at).getTime() <= Date.now()) {
    return jsonResponse({ success: false, error: 'Invitation is expired or no longer active.' }, 409);
  }
  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    return jsonResponse({ success: false, error: 'Invitation email does not match the signed-in account.' }, 403);
  }

  const { data: appUser, error: appUserError } = await adminClient
    .from('users')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (appUserError || !appUser) return jsonResponse({ success: false, error: 'Application user is not linked.' }, 403);

  const { error: membershipError } = await adminClient.rpc('accept_workspace_invitation', {
    target_invitation: invitation.id,
    joining_user: appUser.id,
  });
  if (membershipError) {
    if (membershipError.message.includes('WORKSPACE_MEMBER_LIMIT_REACHED')) {
      return jsonResponse({ success: false, error: 'This workspace has reached its member limit.' }, 409);
    }
    return jsonResponse({ success: false, error: 'Could not create workspace membership.' }, 500);
  }

  return jsonResponse({ success: true, workspace_id: invitation.workspace_id, role: invitation.role });
});