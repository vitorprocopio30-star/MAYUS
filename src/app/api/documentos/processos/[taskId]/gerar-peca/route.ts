import { NextRequest, NextResponse } from 'next/server';
import { getTenantSession } from '@/lib/auth/get-tenant-session';
import { generateLegalPiece, type LegalPieceType } from '@/lib/juridico/generate-piece';

export const runtime = 'nodejs';

const ALLOWED_PIECE_TYPES = new Set<LegalPieceType>([
  'peticao_inicial',
  'contestacao',
  'replica',
  'tutela_urgencia',
  'apelacao',
  'notificacao_extrajudicial',
]);

export async function POST(request: NextRequest, { params }: { params: { taskId: string } }) {
  try {
    const { tenantId } = await getTenantSession();
    const taskId = String(params?.taskId || '').trim();
    const body = await request.json().catch(() => null);
    const pieceType = String(body?.pieceType || '').trim() as LegalPieceType;

    if (!taskId) {
      return NextResponse.json({ error: 'Processo invalido para geracao da peca.' }, { status: 400 });
    }

    if (!ALLOWED_PIECE_TYPES.has(pieceType)) {
      return NextResponse.json({ error: 'Tipo de peca invalido.' }, { status: 400 });
    }

    const result = await generateLegalPiece({
      tenantId,
      processTaskId: taskId,
      pieceType,
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
