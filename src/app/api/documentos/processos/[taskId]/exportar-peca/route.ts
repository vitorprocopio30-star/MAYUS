import { NextRequest, NextResponse } from 'next/server';
import { getTenantSession } from '@/lib/auth/get-tenant-session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { exportLegalPieceToDocx } from '@/lib/juridico/export-piece-docx';

export const runtime = 'nodejs';

function sanitizeFileName(value: string) {
  return String(value || 'peca-juridica')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'peca-juridica';
}

export async function POST(request: NextRequest, { params }: { params: { taskId: string } }) {
  try {
    const { tenantId } = await getTenantSession();
    const taskId = String(params?.taskId || '').trim();
    const body = await request.json().catch(() => null);
    const draftMarkdown = String(body?.draftMarkdown || '').trim();
    const pieceLabel = String(body?.pieceLabel || 'Peca Juridica').trim();
    const pieceType = String(body?.pieceType || 'peca_juridica').trim();

    if (!taskId) {
      return NextResponse.json({ error: 'Processo invalido para exportacao.' }, { status: 400 });
    }

    if (!draftMarkdown) {
      return NextResponse.json({ error: 'Nao ha rascunho para exportar.' }, { status: 400 });
    }

    const [taskRes, profileRes, templateRes, assetsRes] = await Promise.all([
      supabaseAdmin
        .from('process_tasks')
        .select('id, title, client_name, process_number')
        .eq('id', taskId)
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      supabaseAdmin
        .from('tenant_legal_profiles')
        .select('office_display_name, default_font_family, body_font_size, title_font_size, paragraph_spacing, line_spacing, text_alignment, margin_top, margin_right, margin_bottom, margin_left, signature_block, use_page_numbers, use_header, use_footer')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      supabaseAdmin
        .from('tenant_legal_templates')
        .select('piece_type, template_name, template_mode, template_docx_url, structure_markdown, guidance_notes')
        .eq('tenant_id', tenantId)
        .eq('piece_type', pieceType)
        .eq('is_active', true)
        .maybeSingle(),
      supabaseAdmin
        .from('tenant_legal_assets')
        .select('asset_type, file_url, file_name, mime_type')
        .eq('tenant_id', tenantId)
        .eq('is_active', true),
    ]);

    if (taskRes.error) throw taskRes.error;
    if (profileRes.error) throw profileRes.error;
    if (templateRes.error) throw templateRes.error;
    if (assetsRes.error) throw assetsRes.error;
    if (!taskRes.data) {
      return NextResponse.json({ error: 'Processo nao encontrado.' }, { status: 404 });
    }

    const buffer = await exportLegalPieceToDocx({
      pieceLabel,
      pieceType,
      processTitle: String(taskRes.data.title || 'Processo sem titulo'),
      processNumber: taskRes.data.process_number || null,
      clientName: taskRes.data.client_name || null,
      draftMarkdown,
      profile: profileRes.data || null,
      template: templateRes.data || null,
      assets: assetsRes.data || [],
    });

    const fileName = `${sanitizeFileName(pieceType)}-${sanitizeFileName(taskRes.data.title || 'processo')}.docx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro ao exportar a peca em Word.' },
      { status: 500 }
    );
  }
}
