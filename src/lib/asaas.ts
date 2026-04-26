/**
 * Asaas Service
 * Centraliza a comunicação com a API do Asaas (v3).
 */

import { requireTenantApiKey } from '@/lib/integrations/server';

export interface AsaasPaymentParams {
  customer: string;
  billingType: 'BOLETO' | 'CREDIT_CARD' | 'PIX' | 'UNDEFINED';
  value: number;
  dueDate: string;
  description?: string;
  externalReference?: string;
}

export interface AsaasInstallmentParams {
  customer: string;
  billingType: 'BOLETO' | 'CREDIT_CARD';
  value: number;            // Valor total
  installmentCount: number; // Número de parcelas
  installmentValue?: number; // Valor de cada parcela (opcional agora)
  dueDate: string;          // Vencimento da PRIMEIRA parcela
  description?: string;
  externalReference?: string;
}

export interface AsaasListPaymentsParams {
  customer: string;
  status?: 'PENDING' | 'RECEIVED' | 'CONFIRMED' | 'OVERDUE' | 'REFUNDED' | 'RECEIVED_IN_CASH' | 'REFUND_REQUESTED' | 'REFUND_IN_PROGRESS' | 'CHARGEBACK_REQUESTED' | 'CHARGEBACK_DISPUTE' | 'AWAITING_CHARGEBACK_REVERSAL' | 'DUNNING_REQUESTED' | 'DUNNING_RECEIVED' | 'AWAITING_RISK_ANALYSIS';
  limit?: number;
  offset?: number;
}

export interface AsaasPaymentResponse {
  id: string;
  dateCreated: string;
  customer: string;
  paymentLink?: string;
  bankSlipUrl?: string;
  invoiceUrl?: string;
  status: string;
  value: number;
  netValue: number;
  description?: string;
  externalReference?: string;
  dueDate: string;
}

export interface AsaasErrorResponse {
  errors: Array<{
    code: string;
    description: string;
  }>;
}

export interface AsaasCustomerParams {
  name: string;
  email?: string;
  cpfCnpj?: string;
  phone?: string;
  mobilePhone?: string;
  externalReference?: string;
  notificationDisabled?: boolean;
}

export interface AsaasCustomerResponse {
  id: string;
  name: string;
  email: string;
  cpfCnpj: string;
  externalReference?: string;
}

export interface AsaasSubscriptionParams {
  customer: string;
  billingType: 'BOLETO' | 'CREDIT_CARD' | 'PIX' | 'UNDEFINED';
  value: number;
  nextDueDate: string;
  cycle: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY' | 'YEARLY';
  description?: string;
  externalReference?: string;
}

export interface AsaasSubscriptionResponse {
  id: string;
  customer: string;
  value: number;
  nextDueDate: string;
  cycle: string;
  status: string;
  description?: string;
  externalReference?: string;
}


export class AsaasService {
  private static get BASE_URL() {
    return process.env.ASAAS_ENV === 'production'
      ? 'https://api.asaas.com/v3'
      : 'https://sandbox.asaas.com/api/v3';
  }

  private static get API_KEY() {
    return process.env.ASAAS_API_KEY || '';
  }

  /**
   * Busca a chave de API do Asaas para um tenant específico na tabela tenant_integrations.
   */
  static async getApiKey(tenantId: string, supabase: any): Promise<string | null> {
    try {
      const { apiKey } = await requireTenantApiKey(tenantId, 'asaas');
      return apiKey;
    } catch (error: any) {
      console.error('[ASAAS] Erro ao buscar api_key para tenant:', tenantId, error.message);
      return null;
    }
  }

  /**
   * Extrai uma mensagem de erro amigável da resposta do Asaas.
   */
  static extractErrorMessage(payload: any): string {
    if (payload?.errors && Array.isArray(payload.errors) && payload.errors.length > 0) {
      return payload.errors[0].description;
    }
    return 'Erro desconhecido na API do Asaas.';
  }

  /**
   * Cria uma nova cobrança (Boleto, PIX ou Cartão).
   */
  static async createPayment(params: AsaasPaymentParams, apiKey?: string): Promise<AsaasPaymentResponse> {
    const key = apiKey || this.API_KEY;
    console.log('[ASAAS] Usando API_KEY:', key ? 'FORNECIDA' : 'UNDEFINED');
    console.log('[ASAAS] BASE_URL:', this.BASE_URL);

    const response = await fetch(`${this.BASE_URL}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': key,
      },
      body: JSON.stringify(params),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(this.extractErrorMessage(data));
    }

    return data as AsaasPaymentResponse;
  }

  /**
   * Cria uma cobrança parcelada (Boleto ou Cartão).
   */
  static async createInstallmentPayment(params: AsaasInstallmentParams, apiKey?: string): Promise<AsaasPaymentResponse> {
    const key = apiKey || this.API_KEY;
    const response = await fetch(`${this.BASE_URL}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': key,
      },
      body: JSON.stringify({
        ...params,
        billingType: params.billingType || 'BOLETO',
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(this.extractErrorMessage(data));
    }

    return data as AsaasPaymentResponse;
  }

  /**
   * Lista as cobranças de um cliente específico.
   */
  static async listPayments(params: AsaasListPaymentsParams, apiKey?: string): Promise<{ data: AsaasPaymentResponse[] }> {
    const key = apiKey || this.API_KEY;
    const searchParams = new URLSearchParams();
    searchParams.append('customer', params.customer);
    if (params.status) searchParams.append('status', params.status);
    if (params.limit) searchParams.append('limit', String(params.limit));
    if (params.offset) searchParams.append('offset', String(params.offset));

    const response = await fetch(`${this.BASE_URL}/payments?${searchParams.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'access_token': key,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(this.extractErrorMessage(data));
    }

    return data as { data: AsaasPaymentResponse[] };
  }

  /**
   * Busca detalhes de um pagamento específico.
   */
  static async getPayment(paymentId: string, apiKey?: string): Promise<AsaasPaymentResponse> {
    const key = apiKey || this.API_KEY;
    const response = await fetch(`${this.BASE_URL}/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'access_token': key,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(this.extractErrorMessage(data));
    }

    return data as AsaasPaymentResponse;
  }

  static async createCustomer(params: AsaasCustomerParams, apiKey?: string): Promise<AsaasCustomerResponse> {
    const key = apiKey || this.API_KEY;

    // Montagem dinâmica do body (conforme solicitado pelo usuário)
    const customerBody: Record<string, any> = {
      name: params.name,
    };
    if (params.email?.trim()) customerBody.email = params.email.trim();
    if (params.cpfCnpj?.trim()) customerBody.cpfCnpj = params.cpfCnpj.trim();
    if (params.externalReference) customerBody.externalReference = params.externalReference;
    if (params.notificationDisabled !== undefined) customerBody.notificationDisabled = params.notificationDisabled;
    if (params.phone) customerBody.phone = params.phone;
    if (params.mobilePhone) customerBody.mobilePhone = params.mobilePhone;

    const response = await fetch(`${this.BASE_URL}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', access_token: key },
      body: JSON.stringify(customerBody),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(this.extractErrorMessage(data));
    return data as AsaasCustomerResponse;
  }

  static async deleteCustomer(customerId: string, apiKey?: string): Promise<void> {
    const key = apiKey || this.API_KEY;
    await fetch(`${this.BASE_URL}/customers/${customerId}`, {
      method: 'DELETE',
      headers: { access_token: key },
    }).catch(() => {});
  }

  static async createSubscription(params: AsaasSubscriptionParams, apiKey?: string): Promise<AsaasSubscriptionResponse> {
    const key = apiKey || this.API_KEY;
    const response = await fetch(`${this.BASE_URL}/subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', access_token: key },
      body: JSON.stringify(params),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(this.extractErrorMessage(data));
    return data as AsaasSubscriptionResponse;
  }

  static async cancelSubscription(subscriptionId: string, apiKey?: string): Promise<void> {
    const key = apiKey || this.API_KEY;
    await fetch(`${this.BASE_URL}/subscriptions/${subscriptionId}`, {
      method: 'DELETE',
      headers: { access_token: key },
    }).catch(() => {});
  }

  static async getCheckoutUrl(subscriptionId: string, apiKey?: string): Promise<string | null> {
    const key = apiKey || this.API_KEY;
    try {
      const response = await fetch(`${this.BASE_URL}/subscriptions/${subscriptionId}`, {
        headers: { access_token: key },
      });
      const data = await response.json();
      if (data?.paymentLink) return data.paymentLink;

      const paymentsRes = await fetch(
        `${this.BASE_URL}/subscriptions/${subscriptionId}/payments`,
        { headers: { access_token: key } }
      );
      const payments = await paymentsRes.json()
      const first = payments?.data?.[0]
      return first?.invoiceUrl ?? first?.bankSlipUrl ?? null
    } catch {
      return null
    }
  }
}
