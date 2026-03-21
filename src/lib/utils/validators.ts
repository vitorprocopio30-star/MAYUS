export const clearNumber = (value: string) => value.replace(/\D/g, "");

export const formatDocument = (v: string) => {
  v = clearNumber(v);
  if (v.length <= 11) {
    v = v.replace(/(\d{3})(\d)/, "$1.$2");
    v = v.replace(/(\d{3})(\d)/, "$1.$2");
    v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  } else {
    v = v.replace(/^(\d{2})(\d)/, "$1.$2");
    v = v.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
    v = v.replace(/\.(\d{3})(\d)/, ".$1/$2");
    v = v.replace(/(\d{4})(\d)/, "$1-$2");
    if (v.length > 18) v = v.substring(0, 18);
  }
  return v;
};

export const formatCEP = (v: string) => {
  v = clearNumber(v);
  v = v.replace(/^(\d{5})(\d)/, "$1-$2");
  if (v.length > 9) v = v.substring(0, 9);
  return v;
};

export const formatPhone = (v: string) => {
  v = clearNumber(v);
  if (v.length > 10) {
    v = v.replace(/^(\d\d)(\d{5})(\d{4}).*/, "($1) $2-$3");
  } else if (v.length > 5) {
    v = v.replace(/^(\d\d)(\d{4})(\d{0,4}).*/, "($1) $2-$3");
  } else if (v.length > 2) {
    v = v.replace(/^(\d\d)(\d{0,5})/, "($1) $2");
  } else if (v.length > 0) {
    v = v.replace(/^(\d*)/, "($1");
  }
  return v;
};

export const isValidCPF = (cpf: string) => {
  cpf = clearNumber(cpf);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0, remainder;
  for (let i = 1; i <= 9; i++) sum += parseInt(cpf.substring(i - 1, i)) * (11 - i);
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cpf.substring(9, 10))) return false;
  sum = 0;
  for (let i = 1; i <= 10; i++) sum += parseInt(cpf.substring(i - 1, i)) * (12 - i);
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cpf.substring(10, 11))) return false;
  return true;
};

export const isValidCNPJ = (cnpj: string) => {
  cnpj = clearNumber(cnpj);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  let size = cnpj.length - 2;
  let numbers = cnpj.substring(0, size);
  const digits = cnpj.substring(size);
  let sum = 0, pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0))) return false;
  size = size + 1;
  numbers = cnpj.substring(0, size);
  sum = 0;
  pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(1))) return false;
  return true;
};

export const isValidDocument = (doc: string, type: "PF" | "PJ") => {
  return type === "PF" ? isValidCPF(doc) : isValidCNPJ(doc);
};
