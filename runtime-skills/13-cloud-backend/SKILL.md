---
name: cloud-backend
description: >
  Lovable Cloud (backend gerido): migrations com GRANTs, RLS, user_roles,
  storage, segredos e regras de comunicação (dizer "Lovable Cloud", nunca
  "Supabase"). Use antes de qualquer funcionalidade de backend.
---

# Backend: Lovable Cloud

## Objetivo
Implementar persistência, autenticação e lógica de servidor com as regras de
segurança corretas de primeira.

## Ativação

- Obrigatória antes de qualquer backend (auth, DB, storage, server logic) via
  tool diferida `supabase--enable`.
- Após ativar: explicar ao utilizador o que o Cloud habilita (DB+storage
  embutidos, logins sem esforço, functions para pagamentos/emails/DB) e incluir
  o link dos docs.
- **Nunca dizer "Supabase" ao utilizador — dizer "Lovable Cloud".**

## Migrations — ordem obrigatória

```sql
CREATE TABLE public.<nome>(...);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<nome> TO authenticated;
GRANT ALL ON public.<nome> TO service_role;
-- GRANT SELECT ... TO anon;  só se policy permitir leitura anónima
ALTER TABLE public.<nome> ENABLE ROW LEVEL SECURITY;
CREATE POLICY ... ;
```

- PostgREST não concede privileges default no schema `public`: **migration sem
  GRANT é migration errada** (falha em runtime).
- Re-ler o SQL antes de submeter: confirmar GRANT para toda tabela nova.

## Papéis (roles)

- Sempre em tabela separada `user_roles` + enum `app_role` — **nunca** na
  tabela de perfis (escalação de privilégios).
- Função `has_role` security definer para policies sem recursão de RLS.
- Verificação de admin no servidor, nunca em localStorage/credenciais hardcoded.

## Seeds

- Primeira tela precisa de dados demo → a migration inclui **schema + INSERTs
  literais** de cada linha. Nunca semear via page load, server function ou
  `supabase--run_sql`.

## Fronteiras de código

- `createServerFn` (@tanstack/react-start) para lógica interna; sem Edge Functions.
- Rotas HTTP externas/webhooks → `src/routes/api/public/*` (bypass de auth:
  verificar chamador e assinatura no handler; validar input com Zod).
- Funções protegidas: `.middleware([requireSupabaseAuth])`; nunca em loader de
  rota pública (prerender não tem sessão — 401 no build).
- `supabaseAdmin` só para trabalho privilegiado, importado dentro do handler
  após verificar o chamador.

## Segredos

- Guardar chaves privadas via `secrets--add_secret` (checar
  `standard_connectors--list_connections` antes). Ler `process.env` dentro do
  handler; nunca ecoar valores.

## Referências
- `.opencode/TOOLS.md` secção 1.6 — ferramentas de backend.
- Skill `09-gateway-cli` — comandos read-only de diagnóstico (`lovable supabase *`).
