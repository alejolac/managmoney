import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { Card, Page, PageHeader } from "@/components/ui/page";
import { CategoryRow, type CategoryNode } from "./category-row";
import { NewCategoryForm } from "./new-category-form";

export const metadata = { title: "Categorias | Managoney" };

export default async function CategoriasPage() {
  const session = await requireAuth();

  const categories = await prisma.category.findMany({
    where: { workspaceId: session.workspaceId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { transactions: true } } },
  });

  function buildTree(kind: "EXPENSE" | "INCOME"): CategoryNode[] {
    const scoped = categories.filter((category) => category.kind === kind);

    const toNode = (category: (typeof scoped)[number]): CategoryNode => ({
      id: category.id,
      name: category.name,
      color: category.color,
      isSystem: category.isSystem,
      archived: category.archivedAt !== null,
      usage: category._count.transactions,
      children: scoped
        .filter((child) => child.parentId === category.id)
        .map(toNode),
    });

    return scoped
      .filter((category) => category.parentId === null)
      .map(toNode);
  }

  const sections = [
    { kind: "EXPENSE" as const, title: "Gastos" },
    { kind: "INCOME" as const, title: "Ingresos" },
  ];

  return (
    <Page className="max-w-2xl">
      <Link
        href="/configuracion"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Ajustes
      </Link>

      <PageHeader
        title="Categorias"
        description="Este es el catalogo completo. Nada lo amplia solo: ni el OCR, ni el import, ni las reglas. Si algo no encaja, cae en Sin categorizar y lo asignas vos."
      />

      <div className="space-y-8">
        {sections.map((section) => {
          const tree = buildTree(section.kind);
          const parents = tree
            .filter((node) => !node.archived)
            .map((node) => ({ id: node.id, name: node.name }));

          return (
            <section key={section.kind}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                {section.title}
              </h2>

              <ul className="mb-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                {tree.map((node) => (
                  <CategoryRow key={node.id} category={node} />
                ))}
              </ul>

              <Card>
                <NewCategoryForm kind={section.kind} parents={parents} />
              </Card>
            </section>
          );
        })}
      </div>
    </Page>
  );
}
