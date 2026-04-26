import { test, expect } from "@playwright/test";

test.describe("Documentos entrypoint", () => {
  test("redireciona acesso anonimo de /dashboard/documentos para /login", async ({ page }) => {
    await page.goto("/dashboard/documentos");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: /bem-vindo ao mayus\./i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /acesso restrito/i })).toBeVisible();
  });

  test("renderiza o formulario principal de login", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByLabel(/e-mail corporativo/i)).toBeVisible();
    await expect(page.getByLabel(/senha/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /acessar plataforma/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /esqueci minha senha/i })).toBeVisible();
  });

  test("redireciona acesso anonimo de /dashboard/documentos/acervo para /login", async ({ page }) => {
    await page.goto("/dashboard/documentos/acervo");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: /acesso restrito/i })).toBeVisible();
  });
});
