import { NextRequest, NextResponse } from 'next/server';
import { getTenantSession } from '@/lib/auth/get-tenant-session';
import { generateLegalPiece } from '@/lib/juridico/generate-piece';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: { taskId: string } }) {
  try {
    const { tenantId } = await getTenantSession();
    const taskId = String(params?.taskId || '').trim();
    const body = await request.json().catch(() => null);
    const pieceType = String(body?.pieceType || '').trim();

    if (!taskId) {
      return NextResponse.json({ error: 'Processo invalido para geracao da peca.' }, { status: 400 });
    }

    if (!pieceType) {
      return NextResponse.json({ error: 'Informe a peca que deseja gerar.' }, { status: 400 });
    }

    const result = await generateLegalPiece({
      tenantId,
      processTaskId: taskId,
      pieceType,
      practiceArea: String(body?.practiceArea || ''),
      objective: String(body?.objective || ''),
      instructions: String(body?.instructions || ''),
      documentIds: Array.isArray(body?.documentIds) ? body.documentIds : [],
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Nao autenticado.' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error?.message || 'Erro ao gerar a peca com contexto documental.' },
      { status: 500 }
    );
  }
}
