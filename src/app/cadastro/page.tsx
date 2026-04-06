'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function CadastroPage() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    nome_escritorio: '',
    nome: '',
    email: '',
    senha: '',
    telefone: '',
    cnpj: '',
    ciclo: 'anual', // 'anual' ou 'mensal'
    aceite_termos: false,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [errorInfo, setErrorInfo] = useState<string | null>(null);

  // Máscara para Telefone: (99) 99999-9999
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value.replace(/\D/g, '');
    if (v.length > 11) v = v.slice(0, 11);
    
    if (v.length > 2) {
      v = `(${v.substring(0, 2)}) ${v.substring(2)}`;
    }
    if (v.length > 9) {
      v = v.replace(/(\d{5})(\d)/, '$1-$2');
    }
    
    setFormData({ ...formData, telefone: v });
  };

  // Máscara para CNPJ: 99.999.999/9999-99
  const handleCNPJChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value.replace(/\D/g, '');
    if (v.length > 14) v = v.slice(0, 14);
    
    v = v.replace(/^(\d{2})(\d)/, '$1.$2');
    v = v.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
    v = v.replace(/\.(\d{3})(\d)/, '.$1/$2');
    v = v.replace(/(\d{4})(\d)/, '$1-$2');

    setFormData({ ...formData, cnpj: v });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorInfo(null);

    // Validações adicionais no Client
    if (!formData.aceite_termos) {
      setErrorInfo('Você precisa aceitar os termos de uso para continuar.');
      setIsLoading(false);
      return;
    }

    if (formData.senha.length < 8) {
      setErrorInfo('A senha deve conter no mínimo 8 caracteres.');
      setIsLoading(false);
      return;
    }

    // Preparar os dados (remover as máscaras de telefone e CNPJ)
    const payload = {
      ...formData,
      telefone: formData.telefone.replace(/\D/g, ''),
      cnpj: formData.cnpj.replace(/\D/g, '')
    };

    try {
      const response = await fetch('/api/cadastro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || 'Ocorreu um erro ao realizar o cadastro. Tente novamente.');
      }

      // Em caso de sucesso, redirecionar para o onboarding
      router.push('/onboarding');
      
    } catch (err) {
      setErrorInfo(err instanceof Error ? err.message : 'Erro inesperado.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-gray-200 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-white">
          Crie sua conta MAYUS
        </h2>
        <p className="mt-2 text-center text-sm text-gray-400">
          Transforme a gestão do seu escritório.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-[500px]">
        <div className="bg-[#111111] py-8 px-4 shadow-2xl sm:rounded-xl sm:px-10 border border-neutral-800">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* Nome do Escritório */}
            <div>
              <label htmlFor="nome_escritorio" className="block text-sm font-medium text-gray-300">
                Nome do escritório
              </label>
              <div className="mt-1">
                <input
                  id="nome_escritorio"
                  name="nome_escritorio"
                  type="text"
                  required
                  value={formData.nome_escritorio}
                  onChange={handleChange}
                  className="block w-full appearance-none rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 placeholder-neutral-500 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm transition-colors"
                  placeholder="Seu Escritório e Associados"
                />
              </div>
            </div>

            {/* Nome */}
            <div>
              <label htmlFor="nome" className="block text-sm font-medium text-gray-300">
                Seu nome
              </label>
              <div className="mt-1">
                <input
                  id="nome"
                  name="nome"
                  type="text"
                  required
                  value={formData.nome}
                  onChange={handleChange}
                  className="block w-full appearance-none rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 placeholder-neutral-500 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm transition-colors"
                  placeholder="João da Silva"
                />
              </div>
            </div>

            {/* CNPJ e Telefone */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="cnpj" className="block text-sm font-medium text-gray-300">
                  CNPJ <span className="text-neutral-500 font-normal">(Opcional)</span>
                </label>
                <div className="mt-1">
                  <input
                    id="cnpj"
                    name="cnpj"
                    type="text"
                    value={formData.cnpj}
                    onChange={handleCNPJChange}
                    placeholder="00.000.000/0000-00"
                    className="block w-full appearance-none rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 placeholder-neutral-500 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm transition-colors"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="telefone" className="block text-sm font-medium text-gray-300">
                  Telefone <span className="text-neutral-500 font-normal">(Opcional)</span>
                </label>
                <div className="mt-1">
                  <input
                    id="telefone"
                    name="telefone"
                    type="text"
                    value={formData.telefone}
                    onChange={handlePhoneChange}
                    placeholder="(00) 00000-0000"
                    className="block w-full appearance-none rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 placeholder-neutral-500 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* E-mail e Senha */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300">
                  E-mail
                </label>
                <div className="mt-1">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="block w-full appearance-none rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 placeholder-neutral-500 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm transition-colors"
                    placeholder="voce@exemplo.com"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="senha" className="block text-sm font-medium text-gray-300">
                  Senha
                </label>
                <div className="mt-1">
                  <input
                    id="senha"
                    name="senha"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={formData.senha}
                    onChange={handleChange}
                    className="block w-full appearance-none rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 placeholder-neutral-500 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm transition-colors"
                    placeholder="Mínimo de 8 caracteres"
                  />
                </div>
              </div>
            </div>

            {/* Seleção de Ciclo de Assinatura */}
            <div className="pt-2">
              <label className="block text-sm font-medium text-gray-300 mb-3">
                Plano de Assinatura
              </label>
              <div className="flex bg-neutral-900 rounded-lg p-1 border border-neutral-800">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, ciclo: 'mensal' })}
                  className={`flex-1 py-3 text-sm font-medium rounded-md transition-all ${
                    formData.ciclo === 'mensal'
                      ? 'bg-neutral-800 text-white shadow-sm ring-1 ring-neutral-700'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
                  }`}
                >
                  Mensal<br/>
                  <span className="text-xl font-bold mt-1 block">R$ 647</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, ciclo: 'anual' })}
                  className={`flex-1 py-3 text-sm font-medium rounded-md transition-all flex flex-col items-center justify-center relative ${
                    formData.ciclo === 'anual'
                      ? 'bg-indigo-600/10 text-indigo-400 ring-1 ring-indigo-500/50 shadow-sm'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
                  }`}
                >
                  {formData.ciclo === 'anual' && (
                     <div className="absolute -top-2.5 bg-indigo-500 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded-full">
                       Recomendado
                     </div>
                  )}
                  Anual<br/>
                  <span className="text-xl font-bold mt-1 block text-white">R$ 497</span>
                  <span className="text-xs font-normal opacity-80">/mês cobrado anualmente</span>
                </button>
              </div>
            </div>

            {/* Termos de Uso */}
            <div className="flex items-center">
              <input
                id="aceite_termos"
                name="aceite_termos"
                type="checkbox"
                required
                checked={formData.aceite_termos}
                onChange={handleChange}
                className="h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-neutral-900"
              />
              <label htmlFor="aceite_termos" className="ml-2 block text-sm text-neutral-400">
                Eu aceito os{' '}
                <Link href="/termos" target="_blank" className="text-indigo-400 hover:text-indigo-300 underline">
                  termos de uso e política de privacidade
                </Link>.
              </label>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full justify-center rounded-md bg-indigo-600 py-3 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processando...
                  </span>
                ) : (
                  'Criar Conta'
                )}
              </button>
            </div>
            
            {/* Erro de Servidor */}
            {errorInfo && (
              <div className="rounded-md bg-red-900/40 border border-red-500/50 p-4 mt-4">
                <div className="flex">
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-400">{errorInfo}</h3>
                  </div>
                </div>
              </div>
            )}
          </form>

          <div className="mt-6 text-center text-sm text-neutral-500">
             Já possui uma conta?{' '}
             <Link href="/login" className="font-semibold text-indigo-400 hover:text-indigo-300">
               Entrar
             </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
