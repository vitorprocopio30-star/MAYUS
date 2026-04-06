export interface ZapSignSigner {
  name: string;
  email?: string;
  phone_number?: string;
  lock_email?: boolean;
  lock_phone?: boolean;
}

export interface ZapSignVariable {
  variable: string;
  value: string;
}

export interface CreateFromTemplateParams {
  apiToken: string;
  templateId: string;
  docName: string;
  signers: ZapSignSigner[];
  variables?: ZapSignVariable[];
  externalId?: string;
}

export interface CreateDocumentParams {
  apiToken: string;
  docName: string;
  signers: ZapSignSigner[];
  lang?: string;
  externalId?: string;
}

export class ZapSignService {
  private static BASE_URL = "https://api.zapsign.com.br/api/v1";

  /**
   * Cria um documento a partir de um modelo (Template) na ZapSign.
   * Documentação: https://zapsign.com.br/api/
   */
  static async createFromTemplate(params: CreateFromTemplateParams) {
    const { apiToken, templateId, docName, signers, variables, externalId } = params;

    const payload = {
      template_id: templateId,
      name: docName,
      external_id: externalId,
      signers: signers.map(s => ({
        name: s.name,
        email: s.email,
        phone_number: s.phone_number,
        lock_email: s.lock_email ?? true,
        lock_phone: s.lock_phone ?? true,
        blank_email: !s.email,
        blank_phone: !s.phone_number
      })),
      data: variables || [],
      sandbox: true
    };

    try {
      const response = await fetch(`${this.BASE_URL}/models/create-doc/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Erro ao criar documento na ZapSign");
      }

      return await response.json();
    } catch (error: any) {
      console.error("[ZapSignService] Error:", error);
      throw error;
    }
  }

  /**
   * Cria um documento diretamente (sem modelo) na ZapSign.
   * Documentação: https://zapsign.com.br/api/
   */
  static async createDocument(params: CreateDocumentParams) {
    const { apiToken, docName, signers, lang, externalId } = params;

    const payload = {
      name: docName,
      external_id: externalId,
      lang: lang ?? "pt-br",
      sandbox: true,
      base64_pdf: "JVBERi0xLjcKMSAwIG9iajw8L1R5cGUvUGFnZXMvQ291bnQgMS9LaWRzWzMgMCBSXT4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMSAwIFIsL09wZW5BY3Rpb25bMyAwIFIsL0ZpdF1fPj5lbmRvYmoKMyAwIG9iajw8L1R5cGUvUGFnZS9QYXJlbnQgMSAwIFIvTWVkaWFCb3hbMCAwIDU5NSA4NDJdL1Jlc291cmNlczw8L0ZvbnQ8PC9GMSA0IDAgUj4+Pj4vQ29udGVudHMgNSAwIFI+PmVuZG9iago0IDAgb2JqPDwvVHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj5lbmRvYmoKNSAwIG9iajw8L0xlbmd0aCA0ND4+c3RyZWFtCkJUCi9GMSAxMiBUZgovRml0IEggODAwIFRyCjcwIDgwMCBUZAooSGVsbG8gV29ybGQpIFRqCkVUCmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTYgMDAwMDAgbiAKMDAwMDAwMDExOSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDAzMDcgMDAwMDAgbiAKdHJhaWxlcjw8L1NpemUgNi9Sb290IDIgMCBSPj4Kc3RhcnR4cmVmCjQwMAolJUVPRgo=",
      signers: signers.map(s => ({
        name: s.name,
        email: s.email,
        phone_number: s.phone_number,
        auth_mode: "assinaturaTela",
        lock_email: s.lock_email ?? true,
        lock_phone: s.lock_phone ?? true,
        blank_email: !s.email,
        blank_phone: !s.phone_number
      }))
    };

    try {
      console.log("[ZapSign] Enviando request:", {
        url: `${this.BASE_URL}/docs/`,
        body: JSON.stringify(payload)
      });

      const response = await fetch(`${this.BASE_URL}/docs/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiToken}`,
        },
        body: JSON.stringify(payload),
      });

      console.log("[ZapSign] Response status:", response.status);
      const text = await response.text();
      console.log("[ZapSign] Response body:", text);

      if (!response.ok) {
        let errorData;
        try {
          errorData = JSON.parse(text);
        } catch {
          errorData = { detail: text };
        }
        const err: any = new Error(errorData.detail || "Erro ao criar documento na ZapSign");
        err.status = response.status;
        err.response = errorData;
        throw err;
      }

      return JSON.parse(text);
    } catch (error: any) {
      console.error("[ZapSignService] createDocument Error:", error);
      throw error;
    }
  }

  /**
   * Busca detalhes de um documento pelo token/id.
   */
  static async getDocument(apiToken: string, docToken: string) {
    const response = await fetch(`${this.BASE_URL}/docs/${docToken}/?api_token=${apiToken}`);
    if (!response.ok) throw new Error("Erro ao buscar documento na ZapSign");
    return await response.json();
  }
}
