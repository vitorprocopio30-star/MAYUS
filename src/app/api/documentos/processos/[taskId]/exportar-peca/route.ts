import { NextRequest, NextResponse } from 'next/server';
import { getTenantSession } from '@/lib/auth/get-tenant-session';
import { buildTenantGoogleDriveServiceRequest, getTenantGoogleDriveContext } from '@/lib/services/google-drive-tenant';
import { exportLegalPieceBinary, publishLegalPiecePremium, type LegalPieceExportFormat } from '@/lib/juridico/publish-piece-premium';
import { assertDraftVerifiedAgainstCurrent, evaluateVerifiedPieceReadiness } from '@/lib/juridico/verified-piece';
import { getProcessDraftVersionForTask } from '@/lib/lex/draft-versions';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: { taskId: string } }) {
  try {
    const taskId = String(params?.taskId || '').trim();
    const body = await request.json().catch(() => null);

    if (!taskId) {
      return NextResponse.json({ error: 'Processo invalido para exportacao.' }, { status: 400 });
    }

    const publishToDrive = body?.publishToDrive === true;
    const { tenantId } = await getTenantSession({ requireFullAccess: publishToDrive });
    const rawDraftMarkdown = typeof body?.draftMarkdown === 'string' ? body.draftMarkdown : '';
    const pieceLabel = String(body?.pieceLabel || 'Peca Juridica').trim();
    const pieceType = String(body?.pieceType || 'peca_juridica').trim();
    const format = String(body?.format || 'docx').trim().toLowerCase() === 'pdf' ? 'pdf' : 'docx';
    const versionId = String(body?.versionId || '').trim() || null;
    const storedVersion = versionId
      ? await getProcessDraftVersionForTask({
          tenantId,
          processTaskId: taskId,
          versionId,
        })
      : null;
    const draftMarkdown = storedVersion?.draft_markdown || rawDraftMarkdown;
    const effectivePieceLabel = storedVersion?.piece_label || pieceLabel;
    const effectivePieceType = storedVersion?.piece_type || pieceType;

    if (versionId && !storedVersion) {
      return NextResponse.json({ error: 'Versao da minuta nao encontrada para este processo.' }, { status: 404 });
    }

    if (!storedVersion) {
      return NextResponse.json({ error: 'Informe uma versao formal verificavel antes de exportar a peca oficial.' }, { status: 400 });
    }

    if (!draftMarkdown) {
      return NextResponse.json({ error: 'Nao ha rascunho para exportar.' }, { status: 400 });
    }

    const verifiedPiece = await evaluateVerifiedPieceReadiness({ tenantId, processTaskId: taskId });
    assertDraftVerifiedAgainstCurrent({
      draftMetadata: storedVersion.metadata,
      currentSnapshot: verifiedPiece,
    });

    if (publishToDrive) {
      if (storedVersion.workflow_status !== 'published') {
        return NextResponse.json({ error: 'A versao formal precisa estar publicada antes do artifact premium.' }, { status: 409 });
      }

      const driveContext = await getTenantGoogleDriveContext(buildTenantGoogleDriveServiceRequest(), tenantId);
      const published = await publishLegalPiecePremium({
        tenantId,
        taskId,
        accessToken: driveContext.accessToken,
        pieceType: effectivePieceType,
        pieceLabel: effectivePieceLabel,
        draftMarkdown,
        versionId,
      });

      return NextResponse.json({
        success: true,
        published: true,
        publication: published.publication,
        uploadedFile: published.uploadedFile,
      });
    }

    const exported = await exportLegalPieceBinary({
      tenantId,
      taskId,
      pieceType: effectivePieceType,
      pieceLabel: effectivePieceLabel,
      draftMarkdown,
      format: format as LegalPieceExportFormat,
    });

    return new NextResponse(new Uint8Array(exported.buffer), {
      status: 200,
      headers: {
        'Content-Type': exported.mimeType,
        'Content-Disposition': `attachment; filename="${exported.fileName}"`,
      },
    });
  } catch (error: any) {
    if (error?.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Nao autenticado.' }, { status: 401 });
    }

    if (error?.message === 'Forbidden') {
      return NextResponse.json({ error: 'Apenas administradores ou socios podem publicar o artifact premium.' }, { status: 403 });
    }

    if (error?.message === 'GoogleDriveDisconnected' || error?.message === 'GoogleDriveNotConfigured') {
      return NextResponse.json({ error: 'Google Drive não conectado para este escritório.' }, { status: 400 });
    }

    if (/Pacote de Evidencias|verificavel|snapshot verificavel|outro Pacote|citacao factual|sincronizacao documental|volume atual de documentos/i.test(String(error?.message || ''))) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json(
      { error: error?.message || 'Erro ao exportar ou publicar a peça premium.' },
      { status: 500 }
    );
  }
}
