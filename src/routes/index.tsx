import { createFileRoute } from "@tanstack/react-router";
import {
  Code2,
  Sparkles,
  Layers,
  Terminal,
  CheckCircle2,
  Cpu,
  Palette,
  Compass,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Novo Projeto — Ambiente Pronto" },
      {
        name: "description",
        content: "Ambiente limpo e pronto para iniciar um novo projeto do zero.",
      },
      { property: "og:title", content: "Novo Projeto — Ambiente Pronto" },
      {
        property: "og:description",
        content: "Ambiente limpo e pronto para iniciar um novo projeto do zero.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const stack = [
    {
      icon: <Layers className="size-5 text-primary" />,
      title: "TanStack Start & React 19",
      description:
        "Roteamento baseado em arquivos em src/routes/ e SSR nativo de alta performance.",
    },
    {
      icon: <Palette className="size-5 text-primary" />,
      title: "Tailwind CSS v4 & Radix UI",
      description:
        "Biblioteca completa de componentes em src/components/ui/ com tokens modernos em OKLCH.",
    },
    {
      icon: <Cpu className="size-5 text-primary" />,
      title: "Runtime Agêntico & OpenCode",
      description:
        "Proxy configurado na rota /oc para integração contínua e suporte do agente em background.",
    },
    {
      icon: <Terminal className="size-5 text-primary" />,
      title: "Tooling & Automação",
      description:
        "Ambiente pronto para Vite, Vitest, TypeScript estrito e ESLint sem resíduos legados.",
    },
  ];

  const steps = [
    "Crie suas páginas criando novos arquivos em src/routes/",
    "Utilize os componentes de design system já disponíveis em src/components/ui/",
    "Defina utilitários e regras de negócio em src/lib/",
    "Execute npm run dev para iniciar o servidor de desenvolvimento",
  ];

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      {/* Top Bar */}
      <header className="border-b border-border/40 bg-card/40 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary">
              <Code2 className="size-4" />
            </div>
            <span className="font-semibold text-sm tracking-tight text-foreground">Workspace</span>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-primary/30 text-primary bg-primary/5 text-xs font-normal"
            >
              <span className="mr-1.5 size-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
              Ambiente Pronto
            </Badge>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-6 py-12 flex flex-col justify-center">
        {/* Hero Section */}
        <section className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground mb-4">
            <Sparkles className="size-3.5 text-primary" />
            <span>Base 100% limpa & configurada</span>
          </div>

          <h1 className="font-serif text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
            Pronto para um <span className="text-primary">novo projeto</span>
          </h1>

          <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
            Todo o conteúdo anterior foi removido. O ambiente de desenvolvimento, tooling,
            bibliotecas e componentes visuais estão intactos para você começar a construir sua
            aplicação.
          </p>
        </section>

        {/* Stack Grid */}
        <section className="grid gap-4 sm:grid-cols-2 mb-10">
          {stack.map((item, index) => (
            <Card
              key={index}
              className="border-border/60 bg-card/60 backdrop-blur-xs transition-colors hover:border-primary/30"
            >
              <CardHeader className="p-5 pb-2">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-md bg-secondary/80 border border-border/40">
                    {item.icon}
                  </div>
                  <CardTitle className="text-base font-semibold">{item.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-1 text-xs sm:text-sm text-muted-foreground">
                {item.description}
              </CardContent>
            </Card>
          ))}
        </section>

        {/* Checklist */}
        <section className="rounded-xl border border-border/60 bg-card/40 p-6 sm:p-7 max-w-3xl mx-auto w-full">
          <div className="flex items-center gap-2 mb-4 text-foreground font-medium text-sm">
            <Compass className="size-4 text-primary" />
            <span>Primeiros Passos</span>
          </div>

          <ul className="space-y-3">
            {steps.map((step, idx) => (
              <li
                key={idx}
                className="flex items-start gap-3 text-xs sm:text-sm text-muted-foreground"
              >
                <CheckCircle2 className="size-4 text-primary/70 shrink-0 mt-0.5" />
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/30 py-6 text-center text-xs text-muted-foreground">
        <p>Ambiente pronto para criação do novo projeto.</p>
      </footer>
    </div>
  );
}
